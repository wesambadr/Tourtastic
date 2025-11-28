const Notification = require("../models/Notification");
const asyncHandler = require("../middleware/asyncHandler");
const User = require("../models/User");
const cloudStorageService = require("../services/gcsService");
const { generateSignedUrl } = require("../utils/gcsStorage");
const multer = require("multer");

// Use memory storage for multer here so we can stream directly to Supabase
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Convert notification pdfUrl to signed URL
 */
async function convertNotificationUrl(notification) {
  if (!notification) return notification;
  
  const notif = notification.toObject ? notification.toObject() : { ...notification };
  
  // Convert pdfUrl to signed URL if it's a supabase:// path
  if (notif.pdfUrl && notif.pdfUrl.startsWith('supabase://')) {
    try {
      notif.pdfUrl = await generateSignedUrl(notif.pdfUrl, 86400); // 24 hours
    } catch (err) {
      console.warn('Failed to generate signed URL for notification PDF:', err.message);
      // Keep the original path as fallback
    }
  }
  
  return notif;
}

// @desc    Get all notifications for a user
// @route   GET /api/notifications
// @access  Private
// Get notifications for the authenticated user (legacy)
exports.getNotifications = asyncHandler(async (req, res) => {
  // populate recipient user basic info for client display
  const notifications = await Notification.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .populate('userId', 'name email username');

  // Convert all pdfUrls to signed URLs
  const notificationsWithUrls = await Promise.all(
    notifications.map(n => convertNotificationUrl(n))
  );

  res.status(200).json({ success: true, data: notificationsWithUrls });
});

// Get notifications for a specific userId. A user may fetch only their own notifications unless the requester is admin.
exports.getNotificationsByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // If requester is not admin, ensure they are requesting their own notifications
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .populate('userId', 'name email username');

  // Convert all pdfUrls to signed URLs
  const notificationsWithUrls = await Promise.all(
    notifications.map(n => convertNotificationUrl(n))
  );

  res.status(200).json({ success: true, data: notificationsWithUrls });
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
// Mark a specific notification as read. Owners or admins only.
exports.markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  // Only owner or admin can mark as read
  if (req.user.role !== 'admin' && notification.userId.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  notification.read = true;
  await notification.save();

  res.status(200).json({ success: true, data: notification });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});

// @desc    Create a notification
// @route   POST /api/notifications
// @access  Private
// Create a notification - kept for legacy API (creates single notification for authenticated user)
exports.createNotification = asyncHandler(async (req, res) => {
  const { userId, title, message, type } = req.body;

  if (!title?.en || !title?.ar || !message?.en || !message?.ar) {
    return res.status(400).json({ success: false, message: 'Title and message must include both English and Arabic versions' });
  }

  const notification = await Notification.create({ userId, title, message, type });
  res.status(201).json({ success: true, data: notification });
});

// Admin-only: Send notification to a single user (by email/username) or to all users. Accepts multipart/form-data with optional 'pdf' file.
exports.sendNotification = [
  // multer middleware for single file upload in memory
  memoryUpload.single('pdf'),
  asyncHandler(async (req, res) => {
    try {
    } catch (logErr) {
      console.warn('sendNotification logging failed', logErr);
    }

    // Ensure admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { recipientType, recipient, title, message, type } = req.body;

    // Parse multilingual fields which may be sent as JSON strings from the client
    let parsedTitle = title;
    let parsedMessage = message;
    try {
      if (typeof title === 'string') parsedTitle = JSON.parse(title);
    } catch (e) {
      // leave as-is
    }
    try {
      if (typeof message === 'string') parsedMessage = JSON.parse(message);
    } catch (e) {
      // leave as-is
    }

    if (!parsedTitle?.en || !parsedTitle?.ar || !parsedMessage?.en || !parsedMessage?.ar) {
      return res.status(400).json({ success: false, message: 'Title and message must include both English and Arabic versions' });
    }

    // Handle optional PDF upload to Cloudinary storage.
    let pdfUrl = null;
    if (req.file && req.file.buffer) {
      try {
        const uploadResult = await cloudStorageService.uploadBuffer(req.file.originalname, req.file.buffer, req.file.mimetype);
        pdfUrl = uploadResult.publicUrl;
      } catch (err) {
        console.error('sendNotification -> Cloudinary upload failed', err);
        return res.status(500).json({ success: false, message: 'Failed to upload PDF to cloud storage' });
      }
    }

    // Build notification payload
    const payload = { title: parsedTitle, message: parsedMessage, type, pdfUrl };

    if (recipientType === 'all') {
      // Send to all active users
      const users = await User.find({ status: 'active' }).select('_id');

      const docs = users.map(u => ({ userId: u._id, ...payload }));
      await Notification.insertMany(docs);
      return res.status(201).json({ success: true, message: 'Notifications sent to all users' });
    }

    // Send to single user (by email or username)
    if (recipientType === 'single') {
      if (!recipient) {
        return res.status(400).json({ success: false, message: 'Recipient is required for single recipientType' });
      }

      const user = await User.findOne({ $or: [{ email: recipient.toLowerCase() }, { username: recipient }] });
      if (!user) {
        return res.status(404).json({ success: false, message: 'Recipient user not found' });
      }

      const notification = await Notification.create({ userId: user._id, ...payload });
      
      // Convert to signed URL for response
      const notificationWithUrl = await convertNotificationUrl(notification);
      
      return res.status(201).json({ success: true, data: notificationWithUrl });
    }

    return res.status(400).json({ success: false, message: 'Invalid recipientType' });
  })
];