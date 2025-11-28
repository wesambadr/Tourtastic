const FlightBooking = require('../models/FlightBooking');
const asyncHandler = require('../middleware/asyncHandler');
const sendEmail = require('../utils/sendEmail');

/**
 * Handle Seeru webhook notifications
 * @route POST /api/webhooks/seeru
 * @access Public (but should be validated with API key)
 */
exports.handleSeeruWebhook = asyncHandler(async (req, res, next) => {
  try {
    const { event, order_id, status, booking_id, tickets, error_message } = req.body;

    console.log('Received Seeru webhook:', {
      event,
      order_id,
      status,
      booking_id,
      timestamp: new Date().toISOString()
    });

    // Validate webhook (in production, verify signature)
    if (!event || !order_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Find booking by Seeru order ID or booking ID
    let booking = null;
    if (booking_id) {
      booking = await FlightBooking.findById(booking_id);
    } else if (order_id) {
      booking = await FlightBooking.findOne({ seeruOrderId: order_id });
    }

    if (!booking) {
      console.warn('Booking not found for order:', order_id);
      // Still return 200 to acknowledge receipt
      return res.status(200).json({
        success: true,
        message: 'Webhook received (booking not found)'
      });
    }

    // Handle different webhook events
    switch (event) {
      case 'order.created':
        await handleOrderCreated(booking, order_id, req.body);
        break;

      case 'order.confirmed':
        await handleOrderConfirmed(booking, order_id, req.body);
        break;

      case 'ticket.issued':
        await handleTicketIssued(booking, order_id, tickets, req.body);
        break;

      case 'ticket.failed':
        await handleTicketFailed(booking, order_id, error_message, req.body);
        break;

      case 'order.cancelled':
        await handleOrderCancelled(booking, order_id, req.body);
        break;

      case 'order.expired':
        await handleOrderExpired(booking, order_id, req.body);
        break;

      default:
        console.warn('Unknown webhook event:', event);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent Seeru from retrying
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
});

/**
 * Handle order created event
 */
async function handleOrderCreated(booking, orderId, webhookData) {
  try {
    console.log('Processing order.created event for:', orderId);

    booking.seeruOrderId = orderId;
    booking.seeruStatus = 'saved';
    booking.seeruSavedAt = new Date();

    await booking.save();

    // Send notification email to customer
    await sendOrderCreatedEmail(booking, orderId);
  } catch (error) {
    console.error('Error handling order.created:', error);
  }
}

/**
 * Handle order confirmed event
 */
async function handleOrderConfirmed(booking, orderId, webhookData) {
  try {
    console.log('Processing order.confirmed event for:', orderId);

    booking.seeruStatus = 'confirmed';
    booking.seeruConfirmedAt = new Date();

    await booking.save();
  } catch (error) {
    console.error('Error handling order.confirmed:', error);
  }
}

/**
 * Handle ticket issued event
 */
async function handleTicketIssued(booking, orderId, tickets, webhookData) {
  try {
    console.log('Processing ticket.issued event for:', orderId);

    // Extract ticket information from webhook
    if (tickets && tickets.length > 0) {
      const firstTicket = tickets[0];
      booking.ticketNumber = firstTicket.ticket_number || firstTicket.etkt;
      booking.pnr = firstTicket.pnr || firstTicket.airline_pnr;
      booking.ticketUrl = firstTicket.ticket_url || '';
    }

    booking.seeruStatus = 'issued';
    booking.seeruIssuedAt = new Date();

    await booking.save();

    // Send ticket email to customer
    await sendTicketEmail(booking, tickets);
  } catch (error) {
    console.error('Error handling ticket.issued:', error);
  }
}

/**
 * Handle ticket failed event
 */
async function handleTicketFailed(booking, orderId, errorMessage, webhookData) {
  try {
    console.log('Processing ticket.failed event for:', orderId);

    booking.seeruStatus = 'failed';
    booking.seeruError = errorMessage || 'Ticket issuance failed';
    booking.seeruFailedAt = new Date();

    await booking.save();

    // Send error notification email
    await sendTicketFailedEmail(booking, errorMessage);
  } catch (error) {
    console.error('Error handling ticket.failed:', error);
  }
}

/**
 * Handle order cancelled event
 */
async function handleOrderCancelled(booking, orderId, webhookData) {
  try {
    console.log('Processing order.cancelled event for:', orderId);

    booking.seeruStatus = 'cancelled';
    booking.seeruCancelledAt = new Date();

    await booking.save();

    // Send cancellation email
    await sendOrderCancelledEmail(booking);
  } catch (error) {
    console.error('Error handling order.cancelled:', error);
  }
}

/**
 * Handle order expired event
 */
async function handleOrderExpired(booking, orderId, webhookData) {
  try {
    console.log('Processing order.expired event for:', orderId);

    booking.seeruStatus = 'expired';
    booking.seeruExpiredAt = new Date();

    await booking.save();

    // Send expiration email
    await sendOrderExpiredEmail(booking);
  } catch (error) {
    console.error('Error handling order.expired:', error);
  }
}

/**
 * Email notification functions
 */

async function sendOrderCreatedEmail(booking, orderId) {
  try {
    const subject = 'Your booking has been confirmed - Tourtastic';
    const html = `
      <h2>Booking Confirmed</h2>
      <p>Dear ${booking.customerName},</p>
      <p>Your booking has been confirmed with Seeru Travel.</p>
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p>We are processing your ticket. You will receive your e-ticket shortly.</p>
      <p>Thank you for booking with Tourtastic!</p>
    `;

    await sendEmail({
      to: booking.customerEmail,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending order created email:', error);
  }
}

async function sendTicketEmail(booking, tickets) {
  try {
    let ticketInfo = '';
    if (tickets && tickets.length > 0) {
      const ticket = tickets[0];
      ticketInfo = `
        <p><strong>Ticket Number:</strong> ${ticket.ticket_number || ticket.etkt}</p>
        <p><strong>PNR:</strong> ${ticket.pnr || ticket.airline_pnr}</p>
      `;
    }

    const subject = 'Your e-ticket is ready - Tourtastic';
    const html = `
      <h2>Your E-Ticket is Ready!</h2>
      <p>Dear ${booking.customerName},</p>
      <p>Your e-ticket has been successfully issued.</p>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      ${ticketInfo}
      <p>Please check your email for the complete ticket details.</p>
      <p>Thank you for booking with Tourtastic!</p>
    `;

    await sendEmail({
      to: booking.customerEmail,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending ticket email:', error);
  }
}

async function sendTicketFailedEmail(booking, errorMessage) {
  try {
    const subject = 'Ticket Issuance Failed - Action Required - Tourtastic';
    const html = `
      <h2>Ticket Issuance Failed</h2>
      <p>Dear ${booking.customerName},</p>
      <p>Unfortunately, we encountered an issue while issuing your ticket.</p>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p><strong>Error:</strong> ${errorMessage}</p>
      <p>Our team will contact you shortly to resolve this issue.</p>
      <p>Thank you for your patience!</p>
    `;

    await sendEmail({
      to: booking.customerEmail,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending ticket failed email:', error);
  }
}

async function sendOrderCancelledEmail(booking) {
  try {
    const subject = 'Your booking has been cancelled - Tourtastic';
    const html = `
      <h2>Booking Cancelled</h2>
      <p>Dear ${booking.customerName},</p>
      <p>Your booking has been cancelled.</p>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p>If you have any questions, please contact our support team.</p>
      <p>Thank you for booking with Tourtastic!</p>
    `;

    await sendEmail({
      to: booking.customerEmail,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending order cancelled email:', error);
  }
}

async function sendOrderExpiredEmail(booking) {
  try {
    const subject = 'Your booking has expired - Tourtastic';
    const html = `
      <h2>Booking Expired</h2>
      <p>Dear ${booking.customerName},</p>
      <p>Your booking has expired and is no longer available.</p>
      <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
      <p>Please contact our support team if you would like to rebook.</p>
      <p>Thank you for your interest in Tourtastic!</p>
    `;

    await sendEmail({
      to: booking.customerEmail,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending order expired email:', error);
  }
}
