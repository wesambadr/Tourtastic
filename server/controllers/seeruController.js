const FlightBooking = require('../models/FlightBooking');
const asyncHandler = require('../middleware/asyncHandler');
const Setting = require('../models/Setting');
const {
  checkFareValidity,
  saveBooking,
  issueTicket,
  getOrderDetails,
  cancelOrder,
  issueOrder,
  getTicketDetails,
  retrieveTicketByPnr,
  refundTicket,
  voidTicket,
  exchangeTicket,
  transformBookingToSeeru,
  transformPassengersToSeeru,
  transformContactToSeeru
} = require('../utils/seeruAPI');

/**
 * Check if Seeru integration is enabled
 */
async function isSeeruEnabled() {
  try {
    const settings = await Setting.findOne({ key: 'integrations' });
    return settings?.value?.seeruTravelEnabled !== false; // Default to true if not set
  } catch (error) {
    console.error('Error checking Seeru settings:', error);
    return true; // Default to enabled if error
  }
}

/**
 * Process booking with Seeru (check fare, save, and issue ticket)
 * @route POST /api/seeru/process-booking
 * @access Private
 */
exports.processBookingWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID is required'
    });
  }

  // Check if Seeru integration is enabled
  const seeruEnabled = await isSeeruEnabled();
  if (!seeruEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Seeru Travel integration is currently disabled'
    });
  }

  try {
    // Get booking from database
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Step 1: Check fare validity
    const bookingData = transformBookingToSeeru(booking);
    const fareCheck = await checkFareValidity(bookingData);

    if (!fareCheck.success) {
      return res.status(400).json({
        success: false,
        message: 'Fare validity check failed',
        error: fareCheck.error
      });
    }

    // Update booking with validated fare data
    booking.fareKey = fareCheck.fareKey;
    booking.seeruValidated = true;
    booking.seeruValidatedAt = new Date();

    // Step 2: Save booking with Seeru
    const passengers = transformPassengersToSeeru(booking.passengers || []);
    const contact = transformContactToSeeru(booking.contact || {});

    const saveResult = await saveBooking(bookingData, passengers, contact);

    if (!saveResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to save booking with Seeru',
        error: saveResult.error
      });
    }

    // Store Seeru order ID
    booking.seeruOrderId = saveResult.orderId;
    booking.seeruStatus = 'saved';
    booking.seeruSavedAt = new Date();

    // Step 3: Issue ticket with Seeru
    const issueResult = await issueTicket(saveResult.orderId);

    if (!issueResult.success) {
      // Ticket issuance failed, but booking is saved
      booking.seeruStatus = 'saved_not_issued';
      booking.seeruError = issueResult.error;
      await booking.save();

      return res.status(400).json({
        success: false,
        message: 'Booking saved but ticket issuance failed',
        error: issueResult.error,
        orderId: saveResult.orderId
      });
    }

    // Update booking with ticket details
    booking.ticketNumber = issueResult.ticketNumber;
    booking.pnr = issueResult.pnr;
    booking.seeruStatus = 'issued';
    booking.seeruIssuedAt = new Date();
    booking.ticketUrl = issueResult.data?.ticket_url || '';

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking processed successfully with Seeru',
      data: {
        bookingId: booking._id,
        orderId: saveResult.orderId,
        ticketNumber: issueResult.ticketNumber,
        pnr: issueResult.pnr,
        status: 'issued'
      }
    });
  } catch (error) {
    console.error('Process booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing booking with Seeru',
      error: error.message
    });
  }
});

/**
 * Check fare validity only
 * @route POST /api/seeru/check-fare
 * @access Private
 */
exports.checkFare = asyncHandler(async (req, res, next) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID is required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const bookingData = transformBookingToSeeru(booking);
    const result = await checkFareValidity(bookingData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Fare validity check failed',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      message: 'Fare is valid',
      data: result.data
    });
  } catch (error) {
    console.error('Check fare error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking fare',
      error: error.message
    });
  }
});

/**
 * Save booking with Seeru only
 * @route POST /api/seeru/save-booking
 * @access Private
 */
exports.saveBookingWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID is required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const bookingData = transformBookingToSeeru(booking);
    const passengers = transformPassengersToSeeru(booking.passengers || []);
    const contact = transformContactToSeeru(booking.contact || {});

    const result = await saveBooking(bookingData, passengers, contact);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to save booking',
        error: result.error
      });
    }

    // Update booking with order ID
    booking.seeruOrderId = result.orderId;
    booking.seeruStatus = 'saved';
    booking.seeruSavedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking saved successfully',
      data: {
        orderId: result.orderId,
        bookingId: booking._id
      }
    });
  } catch (error) {
    console.error('Save booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving booking',
      error: error.message
    });
  }
});

/**
 * Issue ticket with Seeru
 * @route POST /api/seeru/issue-ticket
 * @access Private
 */
exports.issueTicketWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, orderId } = req.body;

  if (!bookingId || !orderId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID and Order ID are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await issueTicket(orderId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to issue ticket',
        error: result.error
      });
    }

    // Update booking with ticket details
    booking.ticketNumber = result.ticketNumber;
    booking.pnr = result.pnr;
    booking.seeruStatus = 'issued';
    booking.seeruIssuedAt = new Date();
    booking.ticketUrl = result.data?.ticket_url || '';
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Ticket issued successfully',
      data: {
        ticketNumber: result.ticketNumber,
        pnr: result.pnr,
        bookingId: booking._id
      }
    });
  } catch (error) {
    console.error('Issue ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error issuing ticket',
      error: error.message
    });
  }
});

/**
 * Get order details from Seeru
 * @route GET /api/seeru/order/:orderId
 * @access Private
 */
exports.getOrderDetailsFromSeeru = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }

  try {
    const result = await getOrderDetails(orderId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to get order details',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting order details',
      error: error.message
    });
  }
});

/**
 * Cancel order with Seeru
 * @route POST /api/seeru/cancel-order
 * @access Private
 */
exports.cancelOrderWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, orderId } = req.body;

  if (!bookingId || !orderId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID and Order ID are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await cancelOrder(orderId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to cancel order',
        error: result.error
      });
    }

    // Update booking status
    booking.seeruStatus = 'cancelled';
    booking.seeruCancelledAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        bookingId: booking._id,
        orderId: orderId
      }
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order',
      error: error.message
    });
  }
});

/**
 * Issue order with Seeru (for already saved bookings)
 * @route POST /api/seeru/issue-order
 * @access Private
 */
exports.issueOrderWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, orderId } = req.body;

  if (!bookingId || !orderId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID and Order ID are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await issueOrder(orderId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to issue order',
        error: result.error
      });
    }

    // Update booking status
    booking.seeruStatus = 'issued';
    booking.seeruIssuedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Order issued successfully',
      data: {
        bookingId: booking._id,
        orderId: orderId
      }
    });
  } catch (error) {
    console.error('Issue order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error issuing order',
      error: error.message
    });
  }
});

/**
 * Get ticket details
 * @route POST /api/seeru/ticket-details
 * @access Private
 */
exports.getTicketDetailsFromSeeru = asyncHandler(async (req, res, next) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({
      success: false,
      message: 'Ticket ID is required'
    });
  }

  try {
    const result = await getTicketDetails(ticketId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to get ticket details',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Get ticket details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting ticket details',
      error: error.message
    });
  }
});

/**
 * Retrieve ticket by PNR
 * @route POST /api/seeru/retrieve-ticket
 * @access Private
 */
exports.retrieveTicketFromSeeru = asyncHandler(async (req, res, next) => {
  const { airlinePnr, lastName } = req.body;

  if (!airlinePnr || !lastName) {
    return res.status(400).json({
      success: false,
      message: 'Airline PNR and last name are required'
    });
  }

  try {
    const result = await retrieveTicketByPnr(airlinePnr, lastName);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve ticket',
        error: result.error
      });
    }

    res.status(200).json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Retrieve ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving ticket',
      error: error.message
    });
  }
});

/**
 * Refund ticket
 * @route POST /api/seeru/refund-ticket
 * @access Private
 */
exports.refundTicketWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, ticketId, legs, totalFees, passengers } = req.body;

  if (!bookingId || !ticketId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID and Ticket ID are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await refundTicket(ticketId, legs || [], totalFees, passengers || []);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to refund ticket',
        error: result.error
      });
    }

    // Update booking status
    booking.ticketStatus = 'refunded';
    booking.refundedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Ticket refunded successfully',
      data: {
        bookingId: booking._id,
        ticketId: ticketId
      }
    });
  } catch (error) {
    console.error('Refund ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refunding ticket',
      error: error.message
    });
  }
});

/**
 * Void ticket
 * @route POST /api/seeru/void-ticket
 * @access Private
 */
exports.voidTicketWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, ticketId, passengers } = req.body;

  if (!bookingId || !ticketId) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID and Ticket ID are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await voidTicket(ticketId, passengers || []);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to void ticket',
        error: result.error
      });
    }

    // Update booking status
    booking.ticketStatus = 'voided';
    booking.voidedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Ticket voided successfully',
      data: {
        bookingId: booking._id,
        ticketId: ticketId
      }
    });
  } catch (error) {
    console.error('Void ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error voiding ticket',
      error: error.message
    });
  }
});

/**
 * Exchange ticket
 * @route POST /api/seeru/exchange-ticket
 * @access Private
 */
exports.exchangeTicketWithSeeru = asyncHandler(async (req, res, next) => {
  const { bookingId, ticketId, exchangeLegs, totalFees, passengers } = req.body;

  if (!bookingId || !ticketId || !exchangeLegs) {
    return res.status(400).json({
      success: false,
      message: 'Booking ID, Ticket ID, and exchange legs are required'
    });
  }

  try {
    const booking = await FlightBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const result = await exchangeTicket(ticketId, exchangeLegs, totalFees, passengers || []);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange ticket',
        error: result.error
      });
    }

    // Update booking status
    booking.ticketStatus = 'exchanged';
    booking.exchangedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Ticket exchanged successfully',
      data: {
        bookingId: booking._id,
        ticketId: ticketId
      }
    });
  } catch (error) {
    console.error('Exchange ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exchanging ticket',
      error: error.message
    });
  }
});
