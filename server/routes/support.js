const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');
const upload = multer();
const { sendMail } = require('../utils/email');
const User = require('../models/User');

// Lightweight handlers to avoid adding new controllers; these can be replaced
// with full controller implementations later.

// Public: submit a support message
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!email || !message) {
    return res.status(400).json({ success: false, error: 'Email and message are required' });
  }

  // In production you'd persist to DB and possibly send email. For now return 201.
  return res.status(201).json({ success: true, data: { name, email, subject, message } });
});

// Admin: list all support messages (protected + admin only)
router.use(protect);
router.use(authorize('admin'));

router.get('/', async (req, res) => {
  // Placeholder: respond with empty list
  return res.status(200).json({ success: true, data: [] });
});

// Admin: send email to single or multiple recipients
router.post('/send-email', upload.single('pdf'), async (req, res) => {
  try {
    const { recipientType, recipient, recipients, subject, smtpAccount } = req.body || {};
    let { bodyHtml, bodyText, from } = req.body || {};

    if (!subject || (!bodyHtml && !bodyText)) {
      return res.status(400).json({ success: false, message: 'Subject and body are required' });
    }

    let targets = [];
    if (recipientType === 'single') {
      if (!recipient) return res.status(400).json({ success: false, message: 'Recipient email is required' });
      targets = [recipient];
    } else if (recipientType === 'multiple') {
      if (!recipients) return res.status(400).json({ success: false, message: 'Recipients list is required' });
      targets = String(recipients)
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e);
      if (targets.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid recipients provided' });
      }
    } else if (recipientType === 'all') {
      // Fetch all users with an email
      const users = await User.find({ email: { $exists: true, $ne: null } }, 'email').lean();
      targets = (users || []).map((u) => u.email).filter(Boolean);
      if (targets.length === 0) {
        return res.status(400).json({ success: false, message: 'No user emails found' });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid recipientType. Use single, multiple, or all.' });
    }

    // Normalize email content: wrap HTML and build text fallback
    const wrapHtml = (inner) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject || 'Message'}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;background:#f6f7fb;color:#222} .card{max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden} .header{background:#0ea5e9;color:#fff;padding:16px 20px;font-size:18px;font-weight:600} .content{padding:20px;font-size:14px;line-height:1.6} .footer{padding:12px 20px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}</style>
  </head>
<body>
  <div class="card">
    <div class="header">${subject || ''}</div>
    <div class="content">${inner || ''}</div>
    <div class="footer">This email was sent by Tourtastic.</div>
  </div>
</body>
</html>`;

    const stripHtml = (html) => String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (bodyHtml) {
      // Only wrap if a full html tag is not already present
      if (!/<html[\s\S]*<\/html>/i.test(bodyHtml)) {
        bodyHtml = wrapHtml(bodyHtml);
      }
      if (!bodyText) bodyText = stripHtml(bodyHtml);
    } else if (bodyText) {
      bodyHtml = wrapHtml(`<pre style="white-space:pre-wrap">${String(bodyText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
    }

    from = from || undefined;

    // Build attachments if pdf present
    let attachments = [];
    if (req.file) {
      attachments.push({ filename: req.file.originalname || 'attachment.pdf', content: req.file.buffer, contentType: req.file.mimetype || 'application/pdf' });
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const to of targets) {
      try {
        await sendMail({
          to,
          subject,
          html: bodyHtml,
          text: bodyText,
          from,
          attachments,
          smtpAccount,
        });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ to, error: err?.message || 'send failed' });
      }
    }

    return res.status(200).json({ success: true, sent, failed, errors });
  } catch (err) {
    console.error('send-email error', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
