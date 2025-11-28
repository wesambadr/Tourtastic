const Setting = require('../models/Setting');
const {
  checkFareValidity,
  saveBooking,
  issueTicket,
  transformBookingToSeeru,
  transformPassengersToSeeru,
  transformContactToSeeru
} = require('./seeruAPI');

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
 * Check fare validity with Seeru (Step 1: When booking is added to cart)
 * @param {Object} booking - FlightBooking document
 * @returns {Promise<Object>} - Result with status and any errors
 */
async function checkFareValidityIfEnabled(booking) {
  try {
    console.log('🔍 checkFareValidityIfEnabled() called for booking:', booking.bookingId);
    const enabled = await isSeeruEnabled();
    console.log('✅ Seeru enabled check result:', enabled);

    if (!enabled) {
      console.log('Seeru integration is disabled. Booking saved locally only.');
      booking.seeruStatus = 'pending';
      await booking.save();
      return {
        success: true,
        seeruProcessed: false,
        message: 'Booking saved locally (Seeru integration disabled)'
      };
    }

    // Check if Seeru API credentials are configured
    if (!process.env.SEERU_API_KEY || !process.env.SEERU_API_BASE_URL) {
      console.warn('Seeru API credentials not configured. Skipping Seeru processing.');
      booking.seeruStatus = 'pending';
      booking.seeruError = 'Seeru API credentials not configured';
      await booking.save();
      return {
        success: true,
        seeruProcessed: false,
        message: 'Seeru API credentials not configured'
      };
    }

    console.log('🚀 Seeru integration is enabled. Preparing booking for Seeru...');
    console.log('📋 Booking ID:', booking.bookingId);
    
    // Check if we have fare_key from search result
    const selectedFlight = booking.flightDetails?.selectedFlight || {};
    const rawSelectedFlight = selectedFlight.raw || {};
    const fareKey = selectedFlight.fareKey || selectedFlight.fare_key || booking.fareKey || rawSelectedFlight.fareKey || rawSelectedFlight.fare_key;
    
    console.log('🔍 Resolved fareKey:', fareKey);

    // Transform booking data with fare_key (if available)
    const bookingData = transformBookingToSeeru(booking);
    if (fareKey) {
      bookingData.fare_key = fareKey;
    }
    
    console.log('✅ Transformed booking data for Seeru');
    
    // NOTE: /booking/fare is optional in Seeru API
    // Some providers/sandbox environments may not support it
    // The actual fare validation happens during /booking/save
    // So we skip /booking/fare and go directly to marking as ready for save
    
    console.log('⏭️ Skipping /booking/fare (optional endpoint)');
    console.log('📝 Booking will be validated during /booking/save with passenger details');
    
    // Status: Initiated (ready for passenger details and booking save)
    booking.seeruStatus = 'initiated';
    booking.seeruValidated = false; // Will be validated during save
    booking.seeruValidatedAt = new Date();
    booking.seeruError = null; // Clear any previous errors
    await booking.save();
    
    return {
      success: true,
      seeruProcessed: true,
      message: 'Booking prepared for Seeru. Status: Initiated. Waiting for passenger details.',
      status: 'Initiated'
    };
  } catch (error) {
    console.error('❌ Error in checkFareValidityIfEnabled:', error);
    // Set to 'pending' so it can be retried when passenger details are saved
    booking.seeruStatus = 'pending';
    booking.seeruError = `Booking preparation error: ${error.message}`;
    await booking.save();
    return {
      success: false,
      seeruProcessed: false,
      message: 'Error preparing booking for Seeru',
      error: error.message
    };
  }
}

/**
 * Save booking with Seeru (Step 2: When passenger details are saved)
 * @param {Object} booking - FlightBooking document
 * @returns {Promise<Object>} - Result with status and any errors
 */
async function processSeeruBookingIfEnabled(booking) {
  try {
    const enabled = await isSeeruEnabled();

    if (!enabled) {
      console.log('Seeru integration is disabled. Booking saved locally only.');
      return {
        success: true,
        seeruProcessed: false,
        message: 'Booking saved locally (Seeru integration disabled)'
      };
    }

    // Check if Seeru API credentials are configured
    if (!process.env.SEERU_API_KEY || !process.env.SEERU_API_BASE_URL) {
      console.warn('Seeru API credentials not configured. Skipping Seeru processing.');
      booking.seeruStatus = 'pending';
      booking.seeruError = 'Seeru API credentials not configured';
      await booking.save();
      return {
        success: true,
        seeruProcessed: false,
        message: 'Seeru API credentials not configured'
      };
    }

    console.log('🚀 Seeru integration is enabled. Saving booking with passenger details...');
    console.log('📋 Booking ID:', booking.bookingId);
    console.log('📋 Booking fareKey:', booking.fareKey);
    console.log('📋 Booking fareBrand:', booking.fareBrand);
    
    // Check if we have fare_key from previous fare check
    const selectedFlight = booking.flightDetails?.selectedFlight || {};
    const rawSelectedFlight = selectedFlight.raw || {};
    const fareKey = booking.fareKey || selectedFlight.fareKey || selectedFlight.fare_key || rawSelectedFlight.fareKey || rawSelectedFlight.fare_key;
    
    console.log('🔍 Resolved fareKey:', fareKey);
    
    if (!fareKey) {
      console.warn('⚠️ No fare_key found in booking. Seeru requires fare_key from search result.');
      booking.seeruStatus = 'pending';
      booking.seeruError = 'No fare_key from search result. Booking saved locally.';
      await booking.save();
      
      return {
        success: true,
        seeruProcessed: false,
        message: 'Booking saved locally (no fare_key from search)'
      };
    }

    // Transform booking data with fare_key
    const bookingData = transformBookingToSeeru(booking);
    bookingData.fare_key = fareKey;
    
    console.log('✅ Transformed booking data for Seeru');
    console.log('📊 Booking data:', JSON.stringify(bookingData, null, 2));
    
    // Step 2: Save booking with Seeru (POST /booking/save)
    console.log('💾 Saving booking with Seeru (POST /booking/save)...');
    // Extract passengers from root level passengerDetails (priority) or flightDetails.passengerDetails
    const passengerDetails = booking.passengerDetails || booking.flightDetails?.passengerDetails || [];
    console.log('📋 Passenger details from booking (root level):', booking.passengerDetails?.length || 0);
    console.log('📋 Passenger details from flightDetails:', booking.flightDetails?.passengerDetails?.length || 0);
    console.log('📋 Total passenger details found:', passengerDetails.length);
    const passengers = passengerDetails.length > 0 
      ? transformPassengersToSeeru(passengerDetails)
      : transformPassengersToSeeru(booking.passengers || []);
    console.log('📋 Transformed passengers:', JSON.stringify(passengers, null, 2));
    
    // Extract contact from booking
    console.log('📞 Contact data from booking:', {
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      contactFromBooking: booking.contact
    });
    
    const contact = transformContactToSeeru({
      full_name: booking.customerName || '',
      email: booking.customerEmail || '',
      mobile: booking.customerPhone || booking.contact?.mobile || ''
    });
    
    console.log('📞 Transformed contact for Seeru:', contact);
    console.log('🚀 About to call saveBooking() with all data...');

    const saveResult = await saveBooking(bookingData, passengers, contact);

    if (!saveResult.success) {
      console.error('Failed to save booking with Seeru:', saveResult.error);
      booking.seeruStatus = 'failed';
      booking.seeruError = `Save failed: ${saveResult.error}`;
      await booking.save();

      return {
        success: false,
        seeruProcessed: true,
        message: 'Failed to save booking with Seeru',
        error: saveResult.error
      };
    }

    // Store Seeru order ID
    booking.seeruOrderId = saveResult.orderId;
    booking.seeruStatus = 'new'; // Status: New (order created in Seeru)
    booking.seeruSavedAt = new Date();

    // NOTE: Ticket issuance is now done AFTER payment confirmation
    // See paymentController.js handlePaymentCallback() for ticket issuance logic
    console.log('✅ Booking saved with Seeru. Status: New. Ticket will be issued after payment confirmation.');

    await booking.save();

    return {
      success: true,
      seeruProcessed: true,
      message: 'Booking saved with Seeru. Ticket will be issued after payment.',
      data: {
        bookingId: booking._id,
        orderId: saveResult.orderId,
        status: 'saved',
        nextStep: 'Payment confirmation required to issue ticket'
      }
    };
  } catch (error) {
    console.error('Error processing booking with Seeru:', error);

    // Update booking with error status
    try {
      booking.seeruStatus = 'failed';
      booking.seeruError = error.message;
      await booking.save();
    } catch (saveError) {
      console.error('Error saving booking with error status:', saveError);
    }

    return {
      success: false,
      seeruProcessed: true,
      message: 'Error processing booking with Seeru',
      error: error.message
    };
  }
}

/**
 * Get booking status summary
 * @param {Object} booking - FlightBooking document
 * @returns {Object} - Status summary
 */
function getBookingStatusSummary(booking) {
  return {
    bookingId: booking.bookingId,
    seeruStatus: booking.seeruStatus,
    seeruEnabled: booking.seeruOrderId ? true : false,
    ticketIssued: booking.seeruStatus === 'issued',
    ticketNumber: booking.ticketNumber || null,
    pnr: booking.pnr || null,
    orderId: booking.seeruOrderId || null,
    error: booking.seeruError || null,
    timestamps: {
      validated: booking.seeruValidatedAt,
      saved: booking.seeruSavedAt,
      confirmed: booking.seeruConfirmedAt,
      issued: booking.seeruIssuedAt,
      failed: booking.seeruFailedAt,
      cancelled: booking.seeruCancelledAt,
      expired: booking.seeruExpiredAt
    }
  };
}

module.exports = {
  isSeeruEnabled,
  checkFareValidityIfEnabled,
  processSeeruBookingIfEnabled,
  getBookingStatusSummary
};
