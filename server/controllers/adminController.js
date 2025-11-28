const User = require("../models/User");
const Booking = require("../models/Booking");
const FlightBooking = require("../models/FlightBooking");
const Destination = require("../models/Destination");
const NewsletterSubscription = require("../models/NewsletterSubscription");
const SearchLog = require('../models/SearchLog');
const asyncHandler = require("../middleware/asyncHandler");
const sendEmail = require('../utils/sendEmail'); // Import the email utility
const path = require('path');
const fs = require('fs');
// Supabase storage helper
const { uploadFile, uploadBuffer, generateSignedUrl } = require('../utils/gcsStorage');

/**
 * Convert storage path to signed URL for frontend (destinations)
 */
async function convertToSignedUrl(destination) {
  if (!destination) return destination;
  
  const dest = destination.toObject ? destination.toObject() : { ...destination };
  
  // Convert image to signed URL if it's a supabase:// path
  if (dest.image && dest.image.startsWith('supabase://')) {
    try {
      dest.image = await generateSignedUrl(dest.image, 3600);
    } catch (err) {
      console.error('Failed to generate signed URL:', err);
    }
  }
  
  return dest;
}

/**
 * Convert booking ticket paths to signed URLs
 */
async function convertBookingUrls(booking) {
  if (!booking) return booking;
  
  const book = booking.toObject ? booking.toObject() : { ...booking };
  
  // Check multiple possible locations for ticket path
  const ticketPath = 
    (book.ticketDetails && book.ticketDetails.eTicketPath) || 
    book.ticketUrl || 
    book.ticketPdfUrl || 
    (book.ticketInfo && book.ticketInfo.filePath) || 
    (book.ticketDetails && book.ticketDetails.additionalDocuments && 
     book.ticketDetails.additionalDocuments[0] && 
     book.ticketDetails.additionalDocuments[0].path);
  
  if (ticketPath && ticketPath.startsWith('supabase://')) {
    try {
      const signedUrl = await generateSignedUrl(ticketPath, 86400); // 24 hours
      
      // Update all possible locations
      if (book.ticketDetails && book.ticketDetails.eTicketPath) {
        book.ticketDetails.eTicketPath = signedUrl;
      }
      if (book.ticketUrl) book.ticketUrl = signedUrl;
      if (book.ticketPdfUrl) book.ticketPdfUrl = signedUrl;
      if (book.ticketInfo && book.ticketInfo.filePath) {
        book.ticketInfo.filePath = signedUrl;
      }
      if (book.ticketDetails && book.ticketDetails.additionalDocuments && 
          book.ticketDetails.additionalDocuments[0]) {
        book.ticketDetails.additionalDocuments[0].path = signedUrl;
      }
    } catch (err) {
      console.error('Failed to generate signed URL for booking ticket:', err);
    }
  }
  
  return book;
}

// Helper: map FlightBooking document to a client-friendly shape
const mapFlightBookingForClient = (b) => {
  if (!b) return b;
  const paymentAmount = b.paymentDetails && (b.paymentDetails.amount || (b.paymentDetails.transactions && b.paymentDetails.transactions.reduce((s, t) => s + (t.amount || 0), 0)));
  const adminCost = b.adminData && b.adminData.cost && b.adminData.cost.amount;
  const selectedFlightPrice = b.flightDetails && b.flightDetails.selectedFlight && b.flightDetails.selectedFlight.price && b.flightDetails.selectedFlight.price.total;
  const amount = paymentAmount ?? adminCost ?? selectedFlightPrice ?? null;
  // Normalize flightDetails/selectedFlight and expose airport codes where possible
  const flightDet = b.flightDetails || {};
  const sel = (flightDet && flightDet.selectedFlight) || {};
  const rawSel = (sel && sel.raw) || {};

  const departureAirportCode = flightDet.fromAirportCode || sel.departureAirportCode || sel.departureAirport || rawSel.departureAirportCode || rawSel.departure_airport_code || (rawSel.departure_airport && rawSel.departure_airport.code) || undefined;
  const arrivalAirportCode = flightDet.toAirportCode || sel.arrivalAirportCode || sel.arrivalAirport || rawSel.arrivalAirportCode || rawSel.arrival_airport_code || (rawSel.arrival_airport && rawSel.arrival_airport.code) || undefined;

  const normalizedFlightDetails = Object.assign({}, flightDet, {
    fromAirportCode: flightDet.fromAirportCode || departureAirportCode,
    toAirportCode: flightDet.toAirportCode || arrivalAirportCode,
    selectedFlight: Object.assign({}, sel, {
      departureAirportCode: sel.departureAirportCode || departureAirportCode,
      arrivalAirportCode: sel.arrivalAirportCode || arrivalAirportCode,
      // keep raw for debugging
      raw: sel.raw || rawSel
    })
  });

  return {
    _id: b._id,
    id: b.bookingId || (b._id ? String(b._id) : undefined),
    bookingId: b.bookingId,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    // Frontend expects a destination field - derive from flightDetails.to
    destination: flightDet && flightDet.to ? flightDet.to : (b.adminData && b.adminData.bookingReference) || '',
    // Keep a simple type label for legacy UI
    type: 'Flight',
    // bookingDate / date: use departureDate if present otherwise createdAt
    bookingDate: flightDet && flightDet.departureDate ? flightDet.departureDate : b.createdAt,
    date: flightDet && flightDet.departureDate ? flightDet.departureDate : b.createdAt,
    // expose structured details for view UI (use normalized flight details)
    details: {
      flightDetails: normalizedFlightDetails,
      passengerDetails: (flightDet && flightDet.passengerDetails) || [],
      selectedFlight: normalizedFlightDetails.selectedFlight || {},
    },
    amount,
    status: b.status,
    ticketInfo: b.ticketDetails || {},
    ticketDetails: b.ticketDetails || {},
    paymentDetails: b.paymentDetails || {},
    adminData: b.adminData || {},
    timeline: b.timeline || [],
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    // keep raw document in case UI needs more
    _raw: b
  };
};

// --- Dashboard & Reports --- 

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const totalBookings = await Booking.countDocuments();
  const totalUsers = await User.countDocuments();

  // Calculate revenue from bookings collection (Booking.amount)
  const revenueAgg = await Booking.aggregate([
    { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } }
  ]);
  const revenue = (revenueAgg[0] && revenueAgg[0].total) || 0;

  // Basic averages
  const avgBookingValue = totalBookings > 0 ? Math.round(revenue / totalBookings) : 0;

  const stats = {
    totalBookings,
    totalUsers,
    revenue,
    avgBookingValue
  };
  res.status(200).json({ success: true, data: stats });
});

// @desc    Get data for reports
// @route   GET /api/admin/reports
// @access  Private/Admin
// Helper: compute monthly revenue for a given year from FlightBooking
const computeRevenueByMonth = async (year) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const agg = await FlightBooking.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end }, status: { $in: ['done','confirmed'] } } },
    {
      $addFields: {
        txnTotal: {
          $sum: {
            $map: {
              input: { $ifNull: ['$paymentDetails.transactions', []] },
              as: 't',
              in: { $ifNull: ['$$t.amount', 0] }
            }
          }
        }
      }
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        total: {
          $sum: {
            $ifNull: [
              '$paymentDetails.amount',
              { $ifNull: ['$txnTotal', { $ifNull: ['$flightDetails.selectedFlight.price.total', 0] }] }
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0 }));
  agg.forEach(a => { if (a._id >= 1 && a._id <= 12) months[a._id - 1].total = a.total; });
  return months.map(m => m.total || 0);
};

// @desc Get data for reports
// Query params: year (number) - defaults to current year
exports.getReports = asyncHandler(async (req, res, next) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const lastYear = year - 1;

  // total revenue and bookings - from FlightBooking
  const yearlyMatch = { createdAt: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) }, status: { $in: ['done','confirmed'] } };
  const lastYearMatch = { createdAt: { $gte: new Date(lastYear, 0, 1), $lt: new Date(lastYear + 1, 0, 1) }, status: { $in: ['done','confirmed'] } };

  const revenueThisYearAgg = await FlightBooking.aggregate([
    { $match: yearlyMatch },
    { $addFields: { txnTotal: { $sum: { $map: { input: { $ifNull: ['$paymentDetails.transactions', []] }, as: 't', in: { $ifNull: ['$$t.amount', 0] } } } } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$paymentDetails.amount', { $ifNull: ['$txnTotal', { $ifNull: ['$flightDetails.selectedFlight.price.total', 0] }] }] } }, count: { $sum: 1 } } }
  ]);
  const revenueLastYearAgg = await FlightBooking.aggregate([
    { $match: lastYearMatch },
    { $addFields: { txnTotal: { $sum: { $map: { input: { $ifNull: ['$paymentDetails.transactions', []] }, as: 't', in: { $ifNull: ['$$t.amount', 0] } } } } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$paymentDetails.amount', { $ifNull: ['$txnTotal', { $ifNull: ['$flightDetails.selectedFlight.price.total', 0] }] }] } }, count: { $sum: 1 } } }
  ]);

  const totalRevenue = (revenueThisYearAgg[0] && revenueThisYearAgg[0].total) || 0;
  const totalBookings = (revenueThisYearAgg[0] && revenueThisYearAgg[0].count) || 0;
  const lastRevenue = (revenueLastYearAgg[0] && revenueLastYearAgg[0].total) || 0;
  const lastBookings = (revenueLastYearAgg[0] && revenueLastYearAgg[0].count) || 0;

  const growthRateRevenue = lastRevenue > 0 ? Math.round(((totalRevenue - lastRevenue) / lastRevenue) * 100) : 0;
  const growthRateBookings = lastBookings > 0 ? Math.round(((totalBookings - lastBookings) / lastBookings) * 100) : 0;

  // revenue by month
  const revenueByMonth = await computeRevenueByMonth(year);

  // booking distribution by destination (FlightBooking), include done and pending
  const distAgg = await FlightBooking.aggregate([
    { $match: { status: { $in: ['done','pending'] } } },
    { $group: { _id: '$flightDetails.to', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 50 }
  ]);
  const totalDist = distAgg.reduce((s, d) => s + d.count, 0) || 1;
  const bookingDistribution = distAgg.map(d => ({ name: d._id || 'Unknown', value: d.count, percent: Math.round((d.count / totalDist) * 100) }));

  // top destinations (compare with last year's counts) based on FlightBooking
  const topDestinations = await Promise.all(distAgg.slice(0, 10).map(async (d) => {
    const city = d._id || 'Unknown';
    const thisCount = d.count;
    const lastAgg = await FlightBooking.aggregate([
      { $match: { 'flightDetails.to': city, createdAt: { $gte: new Date(lastYear, 0, 1), $lt: new Date(lastYear + 1, 0, 1) } } },
      { $group: { _id: '$flightDetails.to', count: { $sum: 1 } } }
    ]);
    const lastCount = (lastAgg[0] && lastAgg[0].count) || 0;
    const growth = lastCount > 0 ? Math.round(((thisCount - lastCount) / lastCount) * 100) : 0;
    return { destination: city, bookings: thisCount, growthPercent: growth };
  }));

  // search logs aggregated (top 50 routes with counts)
  const searchLogsAgg = await require('../models/SearchLog').aggregate([
    { $group: { _id: { from: '$from', to: '$to' }, count: { $sum: 1 }, lastSearchedAt: { $max: '$searchedAt' } } },
    { $sort: { count: -1, lastSearchedAt: -1 } },
    { $limit: 50 }
  ]);
  const searchLogs = searchLogsAgg.map(s => ({ from: s._id.from, to: s._id.to, count: s.count, lastSearchedAt: s.lastSearchedAt }));

  res.status(200).json({ success: true, data: {
    totalRevenue,
    totalBookings,
    growthRate: { revenue: growthRateRevenue, bookings: growthRateBookings },
    revenueByMonth,
    bookingDistribution,
    topDestinations,
    searchLogs
  } });
});

// @desc    Download report (XLSX/CSV) with full FlightBooking details
// @route   GET /api/admin/reports/download
// @access  Private/Admin
exports.downloadReport = asyncHandler(async (req, res, next) => {
  // Pull flight bookings with rich details
  const bookings = await FlightBooking.find().lean();

  // Robust amount computation per booking
  const computeAmount = (b) => {
    const pd = b?.paymentDetails || {};
    const txSum = Array.isArray(pd.transactions)
      ? pd.transactions.reduce((s, t) => s + (Number(t?.amount) || 0), 0)
      : 0;
    const selectedPrice = b?.flightDetails?.selectedFlight?.price?.total || 0;
    return Number(pd.amount) || txSum || selectedPrice || 0;
  };

  const safe = (v) => (v == null ? '' : v);

  const rows = bookings.map((b) => ({
    bookingId: safe(b.bookingId || b._id),
    status: safe(b.status),
    customerName: safe(b.customerName),
    customerEmail: safe(b.customerEmail),
    customerPhone: safe(b.customerPhone),
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : '',
    updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : '',
    // Flight details
    from: safe(b.flightDetails?.from || b.flightDetails?.fromAirportCode),
    to: safe(b.flightDetails?.to || b.flightDetails?.toAirportCode),
    departureDate: b.flightDetails?.departureDate ? new Date(b.flightDetails.departureDate).toISOString() : '',
    returnDate: b.flightDetails?.returnDate ? new Date(b.flightDetails.returnDate).toISOString() : '',
    passengers_adults: safe(b.flightDetails?.passengerDetails ? b.flightDetails.passengerDetails.filter(p=>p?.type?.toUpperCase?.()==='ADT').length : b.flightDetails?.passengers?.adults),
    passengers_children: safe(b.flightDetails?.passengerDetails ? b.flightDetails.passengerDetails.filter(p=>p?.type?.toUpperCase?.()==='CHD').length : b.flightDetails?.passengers?.children),
    passengers_infants: safe(b.flightDetails?.passengerDetails ? b.flightDetails.passengerDetails.filter(p=>p?.type?.toUpperCase?.()==='INF').length : b.flightDetails?.passengers?.infants),
    airline: safe(b.flightDetails?.selectedFlight?.airline || b.flightDetails?.selectedFlight?.airline_name),
    airlineCode: safe(b.flightDetails?.selectedFlight?.airlineCode),
    flightId: safe(b.flightDetails?.selectedFlight?.flightId),
    departureTime: safe(b.flightDetails?.selectedFlight?.departureTime),
    arrivalTime: safe(b.flightDetails?.selectedFlight?.arrivalTime),
    currency: safe(b.flightDetails?.selectedFlight?.price?.currency || b.paymentDetails?.currency),
    amount: computeAmount(b),
    // Ticket details
    ticketNumber: safe(b.ticketDetails?.ticketNumber),
    pnr: safe(b.ticketDetails?.pnr),
    eTicketPath: safe(b.ticketDetails?.eTicketPath)
  }));

  // Build workbook using exceljs if available, otherwise fallback to CSV
  let ExcelJS;
  try { ExcelJS = require('exceljs'); } catch (e) { ExcelJS = null; }

  if (ExcelJS && rows.length > 0) {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Orders');
      // Define columns based on rows keys
      const cols = Object.keys(rows[0]).map(k => ({ header: k, key: k }));
      sheet.columns = cols;
      rows.forEach(r => sheet.addRow(r));
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Disposition', 'attachment; filename="tourtastic_orders.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(Buffer.from(buffer));
    } catch (err) {
      console.error('exceljs export failed, falling back to CSV', err);
      // continue to CSV fallback
    }
  }

  // Fallback to CSV (even if rows empty, produce header)
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [
    'bookingId','status','customerName','customerEmail','customerPhone','createdAt','updatedAt',
    'from','to','departureDate','returnDate','passengers_adults','passengers_children','passengers_infants',
    'airline','airlineCode','flightId','departureTime','arrivalTime','currency','amount','ticketNumber','pnr','eTicketPath'
  ];
  const header = headers.join(',') + '\n';
  const csv = rows.map(r => headers.map(h => `"${String(r[h] ?? '')}"`).join(',')).join('\n');
  const csvContent = header + csv;
  res.setHeader('Content-Disposition', 'attachment; filename="tourtastic_orders.csv"');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csvContent);
});

// --- Booking Management --- 

// @desc    Get all bookings (Admin)
// @route   GET /api/admin/bookings
// @access  Private/Admin
exports.getAllBookings = asyncHandler(async (req, res, next) => {
  // Add filtering, sorting, pagination later if needed
  const bookings = await Booking.find().populate('userId', 'name email').sort({ createdAt: -1 });
  
  // Convert all ticket paths to signed URLs
  const bookingsWithUrls = await Promise.all(
    bookings.map(b => convertBookingUrls(b))
  );
  
  res.status(200).json({ success: true, count: bookingsWithUrls.length, data: bookingsWithUrls });
});

// @desc    Get single booking (Admin)
// @route   GET /api/admin/bookings/:id
// @access  Private/Admin
exports.getBookingById = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id).populate('userId', 'name email');
  if (!booking) {
    return next(new Error(`Booking not found with id of ${req.params.id}`));
  }
  
  // Convert ticket path to signed URL
  const bookingWithUrl = await convertBookingUrls(booking);
  
  res.status(200).json({ success: true, data: bookingWithUrl });
});

// @desc    Update booking status or details (Admin) - Handles optional PDF upload
// @route   PUT /api/admin/bookings/:id
// @access  Private/Admin
exports.updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findById(req.params.id);
  if (!booking) {
    return next(new Error(`Booking not found with id of ${req.params.id}`));
  }

  // Update fields (e.g., status, notes)
  const { status, notes } = req.body;
  const updateData = { ticketInfo: booking.ticketInfo || {} }; // Ensure ticketInfo exists

  if (status) updateData.status = status;
  if (notes) updateData.ticketInfo.notes = notes;
  
  // Handle file upload if present
  if (req.file) {
      // If there was a previous file, attempt to delete it
      if (updateData.ticketInfo.filePath) {
          const oldPath = path.join(__dirname, '..', updateData.ticketInfo.filePath); // Adjust path as needed
          fs.unlink(oldPath, (err) => {
              if (err) console.error("Error deleting old ticket file:", oldPath, err);
          });
      }
      // Store the relative path from the project root
      updateData.ticketInfo.filePath = req.file.path.replace(/^\.\//, ''); // Store relative path
  }
  
  updateData.updatedAt = Date.now();

  // Perform the update
  booking = await Booking.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, data: booking });
});

// @desc    Delete booking (Admin)
// @route   DELETE /api/admin/bookings/:id
// @access  Private/Admin
exports.deleteBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return next(new Error(`Booking not found with id of ${req.params.id}`));
  }

  // Optionally delete associated ticket file
  if (booking.ticketInfo && booking.ticketInfo.filePath) {
      const filePath = path.join(__dirname, '..', booking.ticketInfo.filePath); // Adjust path
      fs.unlink(filePath, (err) => {
          if (err) console.error("Error deleting ticket file during booking deletion:", filePath, err);
      });
  }

  await booking.deleteOne(); // Use deleteOne or remove

  res.status(200).json({ success: true, data: {} });
});

// @desc    Trigger manual ticket sending (Admin)
// @route   POST /api/admin/bookings/:id/send-ticket
// @access  Private/Admin
exports.sendTicket = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id).populate('userId', 'name email');
  if (!booking) {
    return next(new Error(`Booking not found with id of ${req.params.id}`));
  }

  const recipientEmail = booking.customerEmail;
  if (!recipientEmail) {
       return res.status(400).json({ success: false, message: 'Booking customer email not found.' });
  }

  // Check if a ticket file path exists in the booking record
  const pdfFilePath = booking.ticketInfo && booking.ticketInfo.filePath 
                      ? path.join(__dirname, '..', booking.ticketInfo.filePath) // Construct absolute path
                      : null;

  if (!pdfFilePath || !fs.existsSync(pdfFilePath)) {
      console.error(`Ticket file not found for booking ${booking.bookingId} at path: ${pdfFilePath}`);
      return res.status(400).json({ success: false, message: 'Ticket PDF file not found for this booking. Please upload it first.' });
  }

  // Email content (can be customized via req.body if needed)
  const subject = `Your Tourtastic Ticket for Booking ${booking.bookingId}`;
  const body = `Dear ${booking.customerName},

Please find your travel ticket attached for booking ID: ${booking.bookingId}.

Destination: ${booking.destination || 'N/A'}
Booking Type: ${booking.type}
Date: ${booking.bookingDate.toDateString()}

Thank you for choosing Tourtastic!

Best regards,
The Tourtastic Team`;

  try {
    await sendEmail({
      to: recipientEmail,
      subject: subject,
      text: body,
      attachments: [{ 
          filename: `Tourtastic_Ticket_${booking.bookingId}.pdf`, // Custom filename for email
          path: pdfFilePath 
      }]
    });

    // Update booking status or ticketInfo if needed
    booking.ticketInfo.sentAt = Date.now();
    await booking.save();

    res.status(200).json({ success: true, message: `Ticket email sent successfully to ${recipientEmail}` });
  } catch (err) {
    console.error("Send Ticket Email Error:", err);
    // Use the error handler middleware
    return next(new Error("Email could not be sent. Check server logs and email configuration.")); 
  }
});


// --- User Management --- 

// @desc    Get all users (Admin)
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  // Add filtering, sorting, pagination later
  const users = await User.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: users.length, data: users });
});

// @desc    Get single user (Admin)
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUserById = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new Error(`User not found with id of ${req.params.id}`));
  }
  res.status(200).json({ success: true, data: user });
});

// @desc    Create user (Admin)
// @route   POST /api/admin/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const { name, email, password, role, status } = req.body;
  const user = await User.create({ name, email, password, role, status });
  // Don't send password back
  const userResponse = { ...user._doc };
  delete userResponse.password;
  res.status(201).json({ success: true, data: userResponse });
});

// @desc    Update user details (Admin)
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  // Exclude password from direct update here; handle separately if needed
  const { name, email, role, status } = req.body;
  const updateData = { name, email, role, status };

  // Remove undefined fields to avoid overwriting with null
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new Error(`User not found with id of ${req.params.id}`));
  }
  res.status(200).json({ success: true, data: user });
});

// @desc    Delete user (Admin)
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new Error(`User not found with id of ${req.params.id}`));
  }
  // Add logic here if deleting a user should also delete their bookings or other related data
  // Example: await Booking.deleteMany({ userId: req.params.id });
  await user.deleteOne();
  res.status(200).json({ success: true, data: {} });
});

// --- Destination Management --- 

// @desc    Create destination (Admin) - Handles optional image upload
// @route   POST /api/admin/destinations
// @access  Private/Admin
exports.createDestination = asyncHandler(async (req, res, next) => {
  // parse JSON encoded multipart fields
  const parseIfJson = (val) => {
    if (!val) return val;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (err) { return val; }
  };

  const data = { ...req.body };
  data.name = parseIfJson(req.body.name || req.body['name']);
  data.country = parseIfJson(req.body.country || req.body['country']);
  data.description = parseIfJson(req.body.description || req.body['description']);
  data.bestTimeToVisit = parseIfJson(req.body.bestTimeToVisit || req.body['bestTimeToVisit']);
  data.topAttractions = parseIfJson(req.body.topAttractions || req.body['topAttractions']);
  data.localCuisine = parseIfJson(req.body.localCuisine || req.body['localCuisine']);
  data.shopping = parseIfJson(req.body.shopping || req.body['shopping']);

  // find uploaded file in req.files (upload.any) or req.file
  const findFile = () => {
    if (req.file) return req.file;
    if (Array.isArray(req.files) && req.files.length > 0) {
      const found = req.files.find(f => f.fieldname === 'destinationImage' || f.fieldname === 'image');
      return found || req.files[0];
    }
    return null;
  };

  const uploaded = findFile();
  if (uploaded && uploaded.path && !uploaded.buffer) {
    // saved to disk by multer.diskStorage -> upload local file to Supabase
    try {
      const ext = require('path').extname(uploaded.path) || '.jpg';
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
      const publicUrl = await uploadFile(uploaded.path, destPath, uploaded.mimetype || 'image/jpeg');
      data.image = publicUrl;
    } catch (err) {
      console.error('Upload (admin.createDestination local file) failed:', err);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(err) });
    }
  }

  // If buffer exists (unlikely with diskStorage) handle buffer upload
  if (uploaded && uploaded.buffer) {
    try {
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}.jpg`;
      const publicUrl = await uploadBuffer(uploaded.buffer, destPath, uploaded.mimetype || 'image/jpeg');
      data.image = publicUrl;
    } catch (err) {
      console.error('Upload (admin.createDestination buffer) failed:', err);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(err) });
    }
  }

  // normalize localized fields (simple coercion)
  const ensureLocalized = (val) => {
    if (!val) return { en: '', ar: '' };
    if (typeof val === 'string') return { en: val, ar: val };
    if (typeof val === 'object') return { en: val.en || '', ar: val.ar || '' };
    return { en: '', ar: '' };
  };

  // normalize list fields into { en: string[], ar: string[] }
  const normalizeListField = (val) => {
    if (!val) return { en: [], ar: [] };
    // If it's a JSON string that represents arrays/objects it will already have been parsed
    if (Array.isArray(val)) return { en: val, ar: val };
    if (typeof val === 'object') {
      const enArr = Array.isArray(val.en) ? val.en : (Array.isArray(val) ? val : []);
      const arArr = Array.isArray(val.ar) ? val.ar : (enArr.length ? enArr : []);
      return { en: enArr, ar: arArr };
    }
    // Fallback: single string -> put into en only
    return { en: [String(val)], ar: [String(val)] };
  };

  data.name = ensureLocalized(data.name);
  data.country = ensureLocalized(data.country);
  data.description = ensureLocalized(data.description);
  // Normalize list fields to {en: [], ar: []}
  data.topAttractions = normalizeListField(data.topAttractions);
  data.localCuisine = normalizeListField(data.localCuisine);
  data.shopping = normalizeListField(data.shopping);
  // quickInfo handling
  const qTime = req.body['quickInfo[timeZone]'] || req.body['quickInfo.timeZone'] || req.body.timeZone || req.body.time_zone;
  const qAirport = req.body['quickInfo[airport]'] || req.body['quickInfo.airport'] || req.body.airport || req.body.airport_code;
  data.quickInfo = data.quickInfo || {};
  if (qTime) data.quickInfo.timeZone = qTime;
  if (qAirport) {
    // Store airport as a single code/string value
    data.quickInfo.airport = (typeof qAirport === 'string') ? qAirport : (qAirport && qAirport.code) ? String(qAirport.code) : String(qAirport);
  }

  // Ensure bestTimeToVisit is localized object {en, ar}
  if (!data.bestTimeToVisit) {
    data.bestTimeToVisit = { en: '', ar: '' };
  } else if (typeof data.bestTimeToVisit === 'string') {
    data.bestTimeToVisit = { en: data.bestTimeToVisit, ar: data.bestTimeToVisit };
  } else if (typeof data.bestTimeToVisit === 'object') {
    data.bestTimeToVisit = {
      en: data.bestTimeToVisit.en || '',
      ar: data.bestTimeToVisit.ar || data.bestTimeToVisit.en || ''
    };
  }

  // Ensure quickInfo exists and airport is a simple string code
  if (!data.quickInfo) data.quickInfo = { timeZone: '', airport: '' };
  if (data.quickInfo && data.quickInfo.airport) {
    if (typeof data.quickInfo.airport !== 'string') {
      // attempt to extract a string code
      const ap = data.quickInfo.airport;
      data.quickInfo.airport = ap && ap.code ? String(ap.code) : String(ap);
    }
    data.quickInfo.airport = String(data.quickInfo.airport);
  } else {
    data.quickInfo.airport = '';
  }

  // Debug log
  
  // Ensure quickInfo is parsed if sent as JSON string and normalize airport to string
  if (typeof data.quickInfo === 'string') {
    try { data.quickInfo = JSON.parse(data.quickInfo); } catch (err) { /* leave as string if not parseable */ }
  }
  data.quickInfo = data.quickInfo || {};
  if (data.quickInfo && data.quickInfo.airport) {
    const ap = data.quickInfo.airport;
    if (typeof ap === 'string') {
      data.quickInfo.airport = ap;
    } else if (typeof ap === 'object' && ap !== null) {
      data.quickInfo.airport = ap.code ;
    } else {
      data.quickInfo.airport = String(ap || '');
    }
  } else {
    data.quickInfo.airport = data.quickInfo.airport || '';
  }

  

  // validate
  const missing = [];
  if (!data.image && !data.imageUrl) missing.push('image');
  if (!data.name || !data.name.en) missing.push('name.en');
  if (!data.country || !data.country.en) missing.push('country.en');
  if (missing.length > 0) return res.status(400).json({ success: false, error: 'Missing required fields', missing });

  const destination = await Destination.create(data);
  
  // Convert to signed URL for response
  const destinationWithUrl = await convertToSignedUrl(destination);
  
  res.status(201).json({ success: true, data: destinationWithUrl });
});

// @desc    Update destination (Admin) - Handles optional image upload
// @route   PUT /api/admin/destinations/:id
// @access  Private/Admin
exports.updateDestination = asyncHandler(async (req, res, next) => {
  let destination = await Destination.findById(req.params.id);
  if (!destination) {
    return next(new Error(`Destination not found with id of ${req.params.id}`));
  }

  const updateData = { ...req.body };
  updateData.updatedAt = Date.now(); // Manually update updatedAt

  // Find an uploaded file from multer (accept any field like destinationImage or image)
  const uploaded = (() => {
    if (req.file) return req.file;
    if (Array.isArray(req.files) && req.files.length > 0) {
      const found = req.files.find(f => f.fieldname === 'destinationImage' || f.fieldname === 'image');
      return found || req.files[0];
    }
    return null;
  })();

  if (uploaded && uploaded.path && !uploaded.buffer) {
    try {
      const ext = require('path').extname(uploaded.path) || '.jpg';
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
      const publicUrl = await uploadFile(uploaded.path, destPath, uploaded.mimetype || 'image/jpeg');
      updateData.image = publicUrl;
    } catch (err) {
      console.error('Upload (admin.updateDestination local file) failed:', err);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(err) });
    }
  } else if (uploaded && uploaded.buffer) {
    try {
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}.jpg`;
      const publicUrl = await uploadBuffer(uploaded.buffer, destPath, uploaded.mimetype || 'image/jpeg');
      updateData.image = publicUrl;
    } catch (err) {
      console.error('Upload (admin.updateDestination buffer) failed:', err);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(err) });
    }
  }

  // --- Parse and normalize multipart text fields similar to createDestination ---
  const parseIfJson = (val) => {
    if (!val) return val;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (err) { return val; }
  };

  // Helper: coalesce localized object from various sources
  const coalesceLocalized = (base, enKey, arKey, fallback) => {
    const parsed = parseIfJson(base);
    if (parsed && typeof parsed === 'object') {
      const en = parsed.en ?? (typeof parsed === 'string' ? parsed : undefined);
      const ar = parsed.ar ?? en;
      if (en !== undefined || ar !== undefined) return { en: String(en || ''), ar: String(ar || '') };
    }
    const en = req.body[enKey];
    const ar = req.body[arKey];
    if (en !== undefined || ar !== undefined) {
      return { en: String(en || ''), ar: String(ar || en || '') };
    }
    return fallback;
  };

  // Build/normalize required localized fields. Use existing values as fallback to satisfy validators.
  updateData.name = coalesceLocalized(req.body.name, 'name.en', 'name.ar', destination.name);
  updateData.country = coalesceLocalized(req.body.country, 'country.en', 'country.ar', destination.country);
  updateData.description = coalesceLocalized(req.body.description, 'description.en', 'description.ar', destination.description);
  updateData.bestTimeToVisit = coalesceLocalized(req.body.bestTimeToVisit, 'bestTimeToVisit.en', 'bestTimeToVisit.ar', destination.bestTimeToVisit);

  // Normalize list fields if provided (accept JSON string in req.body)
  const normalizeListField = (val, existing) => {
    if (val === undefined) return existing;
    const p = parseIfJson(val);
    if (p && typeof p === 'object') {
      const enArr = Array.isArray(p.en) ? p.en.map(String) : [];
      const arArr = Array.isArray(p.ar) ? p.ar.map(String) : (enArr.length ? [...enArr] : []);
      return { en: enArr, ar: arArr };
    }
    if (Array.isArray(p)) {
      const arr = p.map(String);
      return { en: arr, ar: [...arr] };
    }
    // fallback single string
    return { en: [String(p)], ar: [String(p)] };
  };

  updateData.topAttractions = normalizeListField(req.body.topAttractions, destination.topAttractions);
  updateData.localCuisine = normalizeListField(req.body.localCuisine, destination.localCuisine);
  updateData.shopping = normalizeListField(req.body.shopping, destination.shopping);

  // quickInfo handling: allow quickInfo[timeZone], quickInfo.timeZone, timeZone; same for airport
  const qTime = req.body['quickInfo[timeZone]'] || req.body['quickInfo.timeZone'] || req.body.timeZone || req.body.time_zone;
  const qAirport = req.body['quickInfo[airport]'] || req.body['quickInfo.airport'] || req.body.airport || req.body.airport_code;
  updateData.quickInfo = updateData.quickInfo || destination.quickInfo || {};
  if (qTime !== undefined) updateData.quickInfo.timeZone = String(qTime || '');
  if (qAirport !== undefined) {
    const ap = qAirport;
    updateData.quickInfo.airport = typeof ap === 'string' ? ap : (ap && ap.code) ? String(ap.code) : String(ap || '');
  }
  // Ensure quickInfo fields are strings
  if (updateData.quickInfo) {
    if (updateData.quickInfo.airport !== undefined) updateData.quickInfo.airport = String(updateData.quickInfo.airport || '');
    if (updateData.quickInfo.timeZone !== undefined) updateData.quickInfo.timeZone = String(updateData.quickInfo.timeZone || '');
  }

  // Optional numeric field
  if (req.body.searchWindowDays !== undefined) {
    const n = parseInt(String(req.body.searchWindowDays), 10);
    if (!Number.isNaN(n)) updateData.searchWindowDays = Math.max(1, n);
  }

  destination = await Destination.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });
  
  // Convert to signed URL for response
  const destinationWithUrl = await convertToSignedUrl(destination);
  
  res.status(200).json({ success: true, data: destinationWithUrl });
});

// @desc    Delete destination (Admin)
// @route   DELETE /api/admin/destinations/:id
// @access  Private/Admin
exports.deleteDestination = asyncHandler(async (req, res, next) => {
  const destination = await Destination.findById(req.params.id);
  if (!destination) {
    return next(new Error(`Destination not found with id of ${req.params.id}`));
  }
  // Delete associated image file
  if (destination.imageUrl) {
      const imagePath = path.join(__dirname, '..', destination.imageUrl);
      fs.unlink(imagePath, (err) => {
          if (err) console.error("Error deleting destination image during deletion:", imagePath, err);
      });
  }
  await destination.deleteOne();
  res.status(200).json({ success: true, data: {} });
});

// --- Newsletter Management --- 

// @desc    Get all newsletter subscribers (Admin)
// @route   GET /api/admin/newsletter/subscribers
// @access  Private/Admin
exports.getSubscribers = asyncHandler(async (req, res, next) => {
  const subscribers = await NewsletterSubscription.find().sort({ subscribedAt: -1 });
  res.status(200).json({ success: true, count: subscribers.length, data: subscribers });
});

// @desc    Send newsletter email (Admin)
// @route   POST /api/admin/newsletter/send
// @access  Private/Admin
exports.sendNewsletter = asyncHandler(async (req, res, next) => {
  const { subject, body } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ success: false, message: "Subject and body are required" });
  }

  const subscribers = await NewsletterSubscription.find();
  const emails = subscribers.map(sub => sub.email);

  if (emails.length === 0) {
      return res.status(200).json({ success: true, message: "No subscribers to send newsletter to." });
  }

  try {
    // Use BCC for privacy
    await sendEmail({ 
        to: process.env.EMAIL_USER, // Send to self or a dummy address
        bcc: emails.join(','), 
        subject,
        text: body 
    }); 
    
    res.status(200).json({ success: true, message: `Newsletter sent successfully to ${emails.length} subscribers (via BCC).` });
  } catch (err) {
    console.error("Send Newsletter Error:", err);
    return next(new Error("Newsletter could not be sent. Check server logs and email configuration."));
  }
});

// --- Admin Profile Management --- (Example - can be expanded)

// @desc    Get current admin profile
// @route   GET /api/admin/profile
// @access  Private/Admin
exports.getAdminProfile = asyncHandler(async (req, res, next) => {
  // req.user is set by protect middleware
  res.status(200).json({ success: true, data: req.user });
});

// @desc    Update current admin profile (e.g., password)
// @route   PUT /api/admin/profile
// @access  Private/Admin
exports.updateAdminProfile = asyncHandler(async (req, res, next) => {
    const { name, email, password } = req.body;
    // Fetch user with password field selected for saving
    const user = await User.findById(req.user.id).select('+password'); 

    if (!user) {
        // This case should ideally not happen if protect middleware is working
        return next(new Error('Admin user not found'));
    }

    // Update fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (password) {
        // If password is being updated, it will be hashed by the pre-save hook
        user.password = password;
    }

    // Save the updated user. Pre-save hook will hash password if changed.
    await user.save();

    // Don't send password back in the response
    const userResponse = { ...user._doc };
    delete userResponse.password;

    res.status(200).json({ success: true, data: userResponse });
});

// --- Flight Booking Management ---

// @desc    Get all flight bookings (Admin)
// @route   GET /api/admin/flight-bookings
// @access  Private/Admin
exports.getAllFlightBookings = asyncHandler(async (req, res, next) => {
  const { status, search } = req.query;
  
  let query = {};
  
  // Filter by status if provided
  if (status) {
    query.status = status;
  }

  // Search by booking ID, customer name, or email
  if (search) {
    query.$or = [
      { bookingId: { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
      { customerEmail: { $regex: search, $options: 'i' } }
    ];
  }

  const bookings = await FlightBooking.find(query).sort({ createdAt: -1 });
  const mapped = bookings.map(mapFlightBookingForClient);
  
  // Convert all ticket paths to signed URLs
  const mappedWithUrls = await Promise.all(
    mapped.map(b => convertBookingUrls(b))
  );

  res.status(200).json({
    success: true,
    count: mappedWithUrls.length,
    data: mappedWithUrls
  });
});

// @desc    Get single flight booking (Admin)
// @route   GET /api/admin/flight-bookings/:bookingId
// @access  Private/Admin
exports.getFlightBookingById = asyncHandler(async (req, res, next) => {
  const booking = await FlightBooking.findOne({ bookingId: req.params.bookingId });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  const mapped = mapFlightBookingForClient(booking);
  
  // Convert ticket path to signed URL
  const mappedWithUrl = await convertBookingUrls(mapped);

  res.status(200).json({
    success: true,
    data: mappedWithUrl
  });
});

// @desc    Update flight booking (Admin)
// @route   PUT /api/admin/flight-bookings/:bookingId
// @access  Private/Admin
exports.updateFlightBooking = asyncHandler(async (req, res, next) => {
  const booking = await FlightBooking.findOne({ bookingId: req.params.bookingId });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  const {
    status,
    adminData,
    ticketDetails,
    paymentDetails
  } = req.body;

  // Update admin data if provided
  if (adminData) {
    booking.adminData = {
      ...booking.adminData,
      ...adminData
    };
  }

  // Update ticket details if provided
  if (ticketDetails) {
    booking.ticketDetails = {
      ...booking.ticketDetails,
      ...ticketDetails
    };
  }

  // Update payment details if provided
  if (paymentDetails) {
    booking.paymentDetails = {
      ...booking.paymentDetails,
      ...paymentDetails
    };
  }

  // Update status and add to timeline if status changed
  if (status && status !== booking.status) {
    booking.status = status;
    booking.timeline.push({
      status,
      date: new Date(),
      notes: req.body.notes || `Status updated to ${status}`,
      updatedBy: req.user.name
    });
  }

  booking.updatedAt = Date.now();
  await booking.save();

  res.status(200).json({
  success: true,
  data: mapFlightBookingForClient(booking)
  });
});

// @desc    Delete a flight booking (Admin)
// @route   DELETE /api/admin/flight-bookings/:bookingId
// @access  Private/Admin
exports.deleteFlightBooking = asyncHandler(async (req, res, next) => {
  const booking = await FlightBooking.findOne({ bookingId: req.params.bookingId });

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Flight booking not found' });
  }

  // Optionally delete uploaded ticket file
  if (booking.ticketDetails && booking.ticketDetails.eTicketPath) {
    const filePath = path.join(__dirname, '..', booking.ticketDetails.eTicketPath);
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting eTicket file during flight booking deletion:', filePath, err);
    });
  }

  await booking.deleteOne();

  res.status(200).json({ success: true, data: {} });
});

// @desc    Upload ticket document
// @route   POST /api/admin/flight-bookings/:bookingId/upload-ticket
// @access  Private/Admin
exports.uploadFlightTicket = asyncHandler(async (req, res, next) => {
  const booking = await FlightBooking.findOne({ bookingId: req.params.bookingId });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload a ticket file"
    });
  }

  // Upload file to Cloudinary via centralized util and use returned URL; fallback to local path if it fails
  let publicUrl = null;
  if (req.file) {
    const localPath = req.file.path;
    const originalName = req.file.originalname || path.basename(localPath);
    const prefix = process.env.CLOUDINARY_UPLOAD_PREFIX_BOOKINGS || process.env.GCP_UPLOAD_PREFIX_BOOKINGS || 'tickets';
    const dest = `${prefix}/${booking.bookingId}/${Date.now()}_${originalName}`;
    try {
      publicUrl = await uploadFile(localPath, dest);
    } catch (err) {
      console.error('Cloudinary upload failed, falling back to local storage', err);
      publicUrl = null;
    }
    // Fallback to local path if Cloudinary upload fails
    if (!publicUrl) {
      publicUrl = req.file.path.replace(/^\.\//, '');
    }

    // Store the ticket file path (URL or local path)
    booking.ticketDetails = booking.ticketDetails || {};
    booking.ticketDetails.eTicketPath = publicUrl;

    // Add to additional documents if specified
    if (req.body.addToDocuments) {
      booking.ticketDetails.additionalDocuments = booking.ticketDetails.additionalDocuments || [];
      booking.ticketDetails.additionalDocuments.push({
        name: originalName,
        path: publicUrl,
        uploadedAt: new Date()
      });
    }

    // remove local temp file if it exists and Cloudinary upload succeeded
    if (publicUrl && publicUrl.startsWith('http')) {
      fs.unlink(localPath, (err) => { if (err) console.warn('Failed to remove local upload:', err); });
    }
  }

  // Save any ticket info fields from form (ticketNumber, pnr) and admin note
  booking.ticketDetails = booking.ticketDetails || {};
  if (req.body.ticketNumber) booking.ticketDetails.ticketNumber = String(req.body.ticketNumber);
  if (req.body.pnr) booking.ticketDetails.pnr = String(req.body.pnr);
  // store admin note under adminData.notes
  booking.adminData = booking.adminData || {};
  if (req.body.adminNote) booking.adminData.notes = String(req.body.adminNote);

  // Mark booking as Done
  booking.status = 'done';

  // Update timeline
  booking.timeline = booking.timeline || [];
  booking.timeline.push({
    status: booking.status,
    date: new Date(),
    notes: "E-ticket uploaded and booking completed",
    updatedBy: req.user ? req.user.name : 'system'
  });

  await booking.save();

  res.status(200).json({
    success: true,
    data: mapFlightBookingForClient(booking)
  });
});

// @desc    Send ticket to customer
// @route   POST /api/admin/flight-bookings/:bookingId/send-ticket
// @access  Private/Admin
exports.sendFlightTicket = asyncHandler(async (req, res, next) => {
  const booking = await FlightBooking.findOne({ bookingId: req.params.bookingId });

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found"
    });
  }

  if (!booking.ticketDetails.eTicketPath) {
    return res.status(400).json({
      success: false,
      message: "No e-ticket found for this booking"
    });
  }

  const emailContent = `Dear ${booking.customerName},

Your flight ticket for booking ${booking.bookingId} is attached.

Flight Details:
From: ${booking.flightDetails.from}
To: ${booking.flightDetails.to}
Date: ${new Date(booking.flightDetails.departureDate).toLocaleDateString()}
${booking.flightDetails.returnDate ? `Return: ${new Date(booking.flightDetails.returnDate).toLocaleDateString()}` : ''}

If you have any questions, please contact us.

Best regards,
Tourtastic Team`;

  try {
    await sendEmail({
      to: booking.customerEmail,
      subject: `Your Flight Ticket - Booking ${booking.bookingId}`,
      text: emailContent,
      attachments: [{
        filename: `ticket_${booking.bookingId}.pdf`,
        path: path.join(__dirname, '..', booking.ticketDetails.eTicketPath)
      }]
    });

    // Update timeline
    booking.timeline.push({
      status: booking.status,
      date: new Date(),
      notes: "Ticket sent to customer",
      updatedBy: req.user.name
    });

    await booking.save();

    res.status(200).json({
  success: true,
  message: "Ticket sent successfully",
  data: mapFlightBookingForClient(booking)
    });
  } catch (error) {
    console.error("Send Flight Ticket Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send ticket email"
    });
  }
});

// @desc    Get admin settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getAdminSettings = asyncHandler(async (req, res, next) => {
  const Setting = require('../models/Setting');
  
  // Get all settings or create defaults
  let settings = await Setting.findOne({ key: 'integrations' });
  
  if (!settings) {
    // Create default settings
    settings = await Setting.create({
      key: 'integrations',
      value: {
        seeruTravelEnabled: true
      }
    });
  }
  
  res.status(200).json({
    success: true,
    data: settings.value
  });
});

// @desc    Update admin settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateAdminSettings = asyncHandler(async (req, res, next) => {
  const Setting = require('../models/Setting');
  const { seeruTravelEnabled } = req.body;
  
  let settings = await Setting.findOne({ key: 'integrations' });
  
  if (!settings) {
    settings = await Setting.create({
      key: 'integrations',
      value: {
        seeruTravelEnabled: seeruTravelEnabled !== undefined ? seeruTravelEnabled : true
      }
    });
  } else {
    settings.value = {
      ...settings.value,
      seeruTravelEnabled: seeruTravelEnabled !== undefined ? seeruTravelEnabled : settings.value.seeruTravelEnabled
    };
    await settings.save();
  }
  
  res.status(200).json({
    success: true,
    data: settings.value
  });
});
