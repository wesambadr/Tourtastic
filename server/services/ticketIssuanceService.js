/**
 * Ticket Issuance Service
 * Monitors confirmed bookings and automatically issues tickets via Seeru
 */

const FlightBooking = require('../models/FlightBooking');
const { issueOrder } = require('../utils/seeruAPI');

let isRunning = false;
let checkInterval = null;

/**
 * Start monitoring confirmed bookings
 * Checks every 30 seconds for bookings that need ticket issuance
 */
async function startTicketIssuanceMonitor() {
  if (isRunning) {
    console.log('⚠️ Ticket issuance monitor already running');
    return;
  }

  isRunning = true;
  console.log('🚀 Starting ticket issuance monitor...');

  // Check immediately on start
  await checkAndIssueTickets();

  // Then check every 30 seconds
  checkInterval = setInterval(async () => {
    try {
      await checkAndIssueTickets();
    } catch (error) {
      console.error('❌ Error in ticket issuance monitor:', error.message);
    }
  }, 30000); // 30 seconds

  console.log('✅ Ticket issuance monitor started');
}

/**
 * Stop monitoring
 */
function stopTicketIssuanceMonitor() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  isRunning = false;
  console.log('⏹️ Ticket issuance monitor stopped');
}

/**
 * Check for confirmed bookings and issue tickets
 */
async function checkAndIssueTickets() {
  try {
    // Find bookings that are:
    // 1. Payment confirmed
    // 2. Seeru order saved
    // 3. Ticket NOT yet issued
    const bookingsToProcess = await FlightBooking.find({
      paymentStatus: 'completed',
      seeruOrderId: { $exists: true, $ne: null },
      seeruStatus: { $in: ['saved', 'confirmed'] }, // Not yet issued
      status: 'confirmed'
    }).limit(10); // Process max 10 at a time

    if (bookingsToProcess.length === 0) {
      return; // No bookings to process
    }

    console.log(`\n📋 Found ${bookingsToProcess.length} bookings to process`);

    for (const booking of bookingsToProcess) {
      try {
        await processBookingTicketIssuance(booking);
      } catch (error) {
        console.error(`❌ Error processing booking ${booking.bookingId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error checking bookings:', error.message);
  }
}

/**
 * Process a single booking for ticket issuance
 */
async function processBookingTicketIssuance(booking) {
  try {
    console.log(`\n🎫 Processing ticket for booking: ${booking.bookingId}`);
    console.log(`   Order ID: ${booking.seeruOrderId}`);
    console.log(`   Status: ${booking.seeruStatus}`);

    // Call Seeru to issue ticket
    const result = await issueOrder(booking.seeruOrderId);

    if (!result.success) {
      console.error(`   ❌ Failed to issue ticket: ${result.error}`);
      booking.seeruError = `Ticket issuance failed: ${result.error}`;
      await booking.save();
      return;
    }

    console.log(`   ✅ Ticket issued successfully`);

    // Update booking status
    booking.seeruStatus = 'issued';
    booking.seeruError = null;
    booking.seeruIssuedAt = new Date();
    await booking.save();

    // Note: Email will be sent via webhook notification from Seeru
    // when ticket.issued event is received
    console.log(`   📧 Email will be sent via Seeru webhook notification`);

    console.log(`   ✅ Booking ${booking.bookingId} completed`);
  } catch (error) {
    console.error(`   ❌ Error processing booking:`, error.message);
    throw error;
  }
}

/**
 * Manually trigger ticket issuance for a specific booking
 */
async function issueTicketForBooking(bookingId) {
  try {
    const booking = await FlightBooking.findOne({ bookingId });

    if (!booking) {
      return {
        success: false,
        message: 'Booking not found'
      };
    }

    if (booking.paymentStatus !== 'completed') {
      return {
        success: false,
        message: 'Payment not confirmed'
      };
    }

    if (!booking.seeruOrderId) {
      return {
        success: false,
        message: 'No Seeru order found'
      };
    }

    await processBookingTicketIssuance(booking);

    return {
      success: true,
      message: 'Ticket issued successfully',
      booking
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get monitor status
 */
function getMonitorStatus() {
  return {
    running: isRunning,
    checkInterval: checkInterval ? '30 seconds' : 'not set'
  };
}

module.exports = {
  startTicketIssuanceMonitor,
  stopTicketIssuanceMonitor,
  checkAndIssueTickets,
  issueTicketForBooking,
  getMonitorStatus
};
