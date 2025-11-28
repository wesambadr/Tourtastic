const express = require('express');
const {
  processBookingWithSeeru,
  checkFare,
  saveBookingWithSeeru,
  issueTicketWithSeeru,
  getOrderDetailsFromSeeru,
  cancelOrderWithSeeru,
  issueOrderWithSeeru,
  getTicketDetailsFromSeeru,
  retrieveTicketFromSeeru,
  refundTicketWithSeeru,
  voidTicketWithSeeru,
  exchangeTicketWithSeeru
} = require('../controllers/seeruController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ===== TEST ENDPOINTS (NO AUTH REQUIRED - for development only) =====
// Issue ticket directly using Seeru Order ID (useful when DB is down)
router.post('/test/issue-direct/:seeruOrderId', async (req, res) => {
  try {
    const { seeruOrderId } = req.params;
    const { issueOrder } = require('../utils/seeruAPI');

    console.log('🧪 TEST: Issuing ticket directly for Seeru order:', seeruOrderId);

    // Issue ticket directly
    const result = await issueOrder(seeruOrderId);

    if (result.success) {
      console.log('✅ TEST: Ticket issued successfully');
      res.status(200).json({
        success: true,
        message: 'Ticket issued successfully',
        ticket: {
          ticketNumber: result.ticketNumber,
          pnr: result.pnr,
          eTicketPath: result.ticketUrl,
          issuedAt: result.issuedAt
        }
      });
    } else {
      console.error('❌ TEST: Failed to issue ticket:', result.error);
      res.status(400).json({
        success: false,
        message: 'Failed to issue ticket',
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ TEST: Error issuing ticket directly:', error);
    res.status(500).json({
      success: false,
      message: 'Error issuing ticket',
      error: error.message
    });
  }
});

// Simulate payment callback for testing (no auth required)
router.post('/test/simulate-payment/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const FlightBooking = require('../models/FlightBooking');
    const { issueOrder } = require('../utils/seeruAPI');

    // Find booking
    const booking = await FlightBooking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    console.log('🧪 TEST: Simulating payment callback for booking:', bookingId);
    console.log('📊 Current booking status:', {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      seeruOrderId: booking.seeruOrderId,
      seeruStatus: booking.seeruStatus
    });

    // Simulate payment completion
    booking.status = 'confirmed';
    booking.paymentStatus = 'completed';
    booking.paymentDetails = {
      status: 'completed',
      currency: 'SYP',
      transactions: [{
        transactionNo: 'TEST-' + Date.now(),
        amount: booking.totalPrice || 0,
        status: 'completed',
        message: 'Test payment',
        timestamp: new Date()
      }]
    };

    // Issue ticket if order exists
    if (booking.seeruOrderId) {
      console.log('🎫 TEST: Issuing ticket for order:', booking.seeruOrderId);
      const result = await issueOrder(booking.seeruOrderId);

      if (result.success) {
        console.log('✅ TEST: Ticket issued successfully');
        booking.seeruStatus = 'issued';
        booking.status = 'issued';
        booking.ticketDetails = {
          ticketNumber: result.ticketNumber,
          pnr: result.pnr,
          eTicketPath: result.ticketUrl
        };
        booking.seeruIssuedAt = result.issuedAt;
      } else {
        console.error('❌ TEST: Failed to issue ticket:', result.error);
        booking.seeruStatus = 'issue_failed';
        booking.seeruError = result.error;
      }
    } else {
      console.warn('⚠️ TEST: No Seeru order ID found. Skipping ticket issuance.');
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment simulation completed',
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        seeruStatus: booking.seeruStatus,
        ticketNumber: booking.ticketDetails?.ticketNumber,
        pnr: booking.ticketDetails?.pnr
      }
    });
  } catch (error) {
    console.error('❌ TEST: Error simulating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error simulating payment',
      error: error.message
    });
  }
});

// All routes require authentication
router.use(protect);

// ===== BOOKING OPERATIONS =====
// Process complete booking (check fare, save, issue ticket)
router.post('/process-booking', processBookingWithSeeru);

// Check fare validity only
router.post('/check-fare', checkFare);

// Save booking with Seeru only
router.post('/save-booking', saveBookingWithSeeru);

// Issue ticket with Seeru
router.post('/issue-ticket', issueTicketWithSeeru);

// Get order details from Seeru
router.get('/order/:orderId', getOrderDetailsFromSeeru);

// Cancel order with Seeru
router.post('/cancel-order', cancelOrderWithSeeru);

// Issue order with Seeru (for already saved bookings)
router.post('/issue-order', issueOrderWithSeeru);

// Retry ticket issuance for failed bookings
router.post('/retry-ticket/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const FlightBooking = require('../models/FlightBooking');
    const { issueOrder } = require('../utils/seeruAPI');

    // Find booking
    const booking = await FlightBooking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Check if payment is confirmed
    if (booking.paymentStatus !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment not confirmed. Cannot issue ticket.' 
      });
    }

    // Check if Seeru order exists
    if (!booking.seeruOrderId) {
      return res.status(400).json({ 
        success: false, 
        message: 'No Seeru order found. Please process booking first.' 
      });
    }

    // Try to issue ticket
    console.log('Retrying ticket issuance for booking:', bookingId);
    const result = await issueOrder(booking.seeruOrderId);

    if (result.success) {
      booking.seeruStatus = 'issued';
      booking.seeruError = null;
      await booking.save();

      return res.status(200).json({ 
        success: true, 
        message: 'Ticket issued successfully',
        booking 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to issue ticket',
        error: result.error 
      });
    }
  } catch (error) {
    console.error('Error retrying ticket issuance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Monitor status endpoint
router.get('/monitor/status', async (req, res) => {
  try {
    const { getMonitorStatus } = require('../services/ticketIssuanceService');
    const status = getMonitorStatus();
    res.status(200).json({ 
      success: true, 
      monitor: status 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Manually trigger ticket issuance for a booking
router.post('/manual-issue/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { issueTicketForBooking } = require('../services/ticketIssuanceService');
    
    const result = await issueTicketForBooking(bookingId);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// ===== TICKET OPERATIONS =====
// Get ticket details by ticket ID
router.post('/ticket-details', getTicketDetailsFromSeeru);

// Retrieve ticket by PNR and last name
router.post('/retrieve-ticket', retrieveTicketFromSeeru);

// Refund ticket
router.post('/refund-ticket', refundTicketWithSeeru);

// Void ticket
router.post('/void-ticket', voidTicketWithSeeru);

// Exchange ticket
router.post('/exchange-ticket', exchangeTicketWithSeeru);

module.exports = router;
