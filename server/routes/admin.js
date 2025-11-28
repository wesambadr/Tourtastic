const express = require("express");
const {
    getDashboardStats,
    getReports,
    downloadReport,
    getAllBookings,
    getBookingById,
    updateBooking, // Handles ticket upload
    deleteBooking,
    sendTicket,
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    createDestination, // Handles image upload
    updateDestination, // Handles image upload
    deleteDestination,
    getSubscribers,
    sendNewsletter,
    getAdminProfile,
    updateAdminProfile,
    getAllFlightBookings,
    getFlightBookingById,
    updateFlightBooking,
    deleteFlightBooking,
    uploadFlightTicket,
    sendFlightTicket,
    getAdminSettings,
    updateAdminSettings
} = require("../controllers/adminController");

const { protect, authorize } = require("../middleware/auth");
const upload = require("../middleware/upload"); // Import upload middleware

const router = express.Router();

// All routes below are protected and require admin role
router.use(protect);
router.use(authorize("admin"));

// Dashboard & Reports
router.get("/stats", getDashboardStats);
router.get("/reports", getReports);
router.get("/reports/download", downloadReport);

// Booking Management
router.route("/bookings")
    .get(getAllBookings);
router.route("/bookings/:id")
    .get(getBookingById)
    // Use upload middleware for the PUT request to handle potential ticket PDF upload
    // It expects the file field name to be 'ticketPdf'
    .put(upload.single("ticketPdf"), updateBooking) 
    .delete(deleteBooking);
router.post("/bookings/:id/send-ticket", sendTicket);

// User Management
router.route("/users")
    .get(getAllUsers)
    .post(createUser);
router.route("/users/:id")
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);

// Destination Management (CRUD operations)
router.route("/destinations")
    // Use upload middleware for POST request to handle potential destination image upload
    // Temporarily accept any file field (destinationImage or image) to diagnose client/server mismatch
    .post(upload.any(), createDestination); 
router.route("/destinations/:id")
    // Use upload middleware for PUT request to handle potential destination image upload
    .put(upload.any(), updateDestination)
    .delete(deleteDestination); 

// Newsletter Management
router.get("/newsletter/subscribers", getSubscribers);
router.post("/newsletter/send", sendNewsletter);

// Admin Profile Management
router.route("/profile")
    .get(getAdminProfile)
    .put(updateAdminProfile);

// Flight Booking Management
router.route("/flight-bookings")
    .get(getAllFlightBookings);

router.route("/flight-bookings/:bookingId")
    .get(getFlightBookingById)
    .put(updateFlightBooking);

// Allow admin deletion of flight bookings
router.route('/flight-bookings/:bookingId').delete(deleteFlightBooking);

router.post(
    "/flight-bookings/:bookingId/upload-ticket",
    upload.single("ticketFile"),
    uploadFlightTicket
);

router.post("/flight-bookings/:bookingId/send-ticket", sendFlightTicket);

// Settings Management
router.route("/settings")
    .get(getAdminSettings)
    .put(updateAdminSettings);

module.exports = router;
