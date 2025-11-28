const axios = require('axios');

const SEERU_API_BASE_URL = process.env.SEERU_API_BASE_URL || 'https://sandbox-api.seeru.travel/v1/flights';
const SEERU_API_KEY = process.env.SEERU_API_KEY;

console.log('🔐 Seeru Configuration:');
console.log('📍 Base URL:', SEERU_API_BASE_URL);
console.log('🔑 API Key:', SEERU_API_KEY ? '✅ Configured' : '❌ Missing');

/**
 * Create axios instance for Seeru API with authentication
 */
const seeruClient = axios.create({
  baseURL: process.env.SEERU_API_BASE_URL || 'https://sandbox-api.seeru.travel/v1/flights',
  headers: {
    'Authorization': `Bearer ${process.env.SEERU_API_KEY || ''}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Add response interceptor to handle network errors gracefully
seeruClient.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('Seeru API is unreachable. Network error:', error.code);
    }
    return Promise.reject(error);
  }
);

/**
 * Check fare validity with Seeru
 * @param {Object} bookingData - Flight booking data (from search result)
 * @returns {Promise<Object>} - Fare validity response
 */
async function checkFareValidity(bookingData) {
  try {
    console.log('🔎 Checking fare validity with Seeru (POST /booking/fare)...');
    console.log('📊 Booking data keys:', Object.keys(bookingData || {}));
    console.log('📊 Booking fare_key:', bookingData?.fare_key);
    
    // Clean booking data - remove only fields that cause issues
    // Keep src and id as Seeru expects them
    const cleanedBooking = {
      price: bookingData.price,
      tax: bookingData.tax,
      refundable_info: bookingData.refundable_info,
      fare_key: bookingData.fare_key || '',
      fare_brand: bookingData.fare_brand,
      price_breakdowns: bookingData.price_breakdowns || {},
      legs: bookingData.legs || [],
      trip_id: bookingData.trip_id,
      search_id: bookingData.search_id || '',
      src: bookingData.src || 'TOURTASTIC',
      id: bookingData.id,
      total_pax_no_inf: bookingData.total_pax_no_inf,
      search_query: bookingData.search_query,
      currency: bookingData.currency,
      can_hold: bookingData.can_hold !== undefined ? bookingData.can_hold : true,
      can_void: bookingData.can_void !== undefined ? bookingData.can_void : true,
      can_refund: bookingData.can_refund !== undefined ? bookingData.can_refund : false,
      can_exchange: bookingData.can_exchange !== undefined ? bookingData.can_exchange : true,
      etd: bookingData.etd
    };
    
    console.log('📤 Sending to Seeru /booking/fare:', JSON.stringify({
      booking: cleanedBooking
    }, null, 2));
    
    console.log('🌐 Seeru Client Config:');
    console.log('  Base URL:', seeruClient.defaults.baseURL);
    console.log('  Auth Header:', seeruClient.defaults.headers.Authorization ? '✅ Set' : '❌ Missing');
    
    const response = await seeruClient.post('/booking/fare', {
      booking: cleanedBooking
    });

    if (response.data && response.data.status === 'success') {
      console.log('✅ Fare validity check passed');
      return {
        success: true,
        fareKey: response.data.booking?.fare_key || response.data.fare_key,
        message: response.data.message
      };
    } else {
      console.error('❌ Fare validity check failed:', response.data);
      return {
        success: false,
        error: response.data?.message || response.data?.error || 'Fare validity check failed'
      };
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
    const errorDetails = error.response?.data || error.message;
    
    // Handle network errors gracefully
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('⚠️ Seeru API is unreachable:', error.code);
      return {
        success: false,
        error: `Seeru API unreachable (${error.code}). Booking saved locally.`,
        isNetworkError: true
      };
    }
    
    console.error('❌ Seeru fare validity error:', errorMsg);
    console.error('📥 Error details:', JSON.stringify(errorDetails, null, 2));
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Save booking with Seeru (create order)
 * @param {Object} bookingData - Flight booking data
 * @param {Array} passengers - Passenger details
 * @param {Object} contact - Contact information
 * @returns {Promise<Object>} - Save booking response with order_id
 */
async function saveBooking(bookingData, passengers, contact) {
  try {
    console.log('\n🔍 saveBooking() called');
    console.log('📊 Booking data keys:', Object.keys(bookingData || {}));
    console.log('📊 Booking fare_key:', bookingData?.fare_key);
    console.log('📊 Booking search_id:', bookingData?.search_id);
    console.log('📊 Passengers count:', passengers?.length || 0);
    console.log('📊 Contact:', contact);
    console.log('💾 Saving booking with Seeru (POST /booking/save)...');
    
    // Clean booking data - keep all fields Seeru expects
    const cleanedBooking = {
      price: bookingData.price,
      tax: bookingData.tax,
      refundable_info: bookingData.refundable_info,
      fare_key: bookingData.fare_key || '',
      fare_brand: bookingData.fare_brand,
      price_breakdowns: bookingData.price_breakdowns || {},
      legs: bookingData.legs || [],
      trip_id: bookingData.trip_id,
      search_id: bookingData.search_id || '',
      src: bookingData.src || 'TOURTASTIC',
      id: bookingData.id,
      total_pax_no_inf: bookingData.total_pax_no_inf,
      search_query: bookingData.search_query,
      currency: bookingData.currency,
      can_hold: bookingData.can_hold !== undefined ? bookingData.can_hold : true,
      can_void: bookingData.can_void !== undefined ? bookingData.can_void : true,
      can_refund: bookingData.can_refund !== undefined ? bookingData.can_refund : false,
      can_exchange: bookingData.can_exchange !== undefined ? bookingData.can_exchange : true,
      etd: bookingData.etd
    };
    
    const payloadToSend = {
      booking: cleanedBooking,
      passengers: passengers,
      contact: contact
    };
    
    console.log('📤 Sending to Seeru /booking/save:');
    console.log('  Booking keys:', Object.keys(cleanedBooking));
    console.log('  Passengers count:', passengers.length);
    console.log('  First passenger:', JSON.stringify(passengers[0], null, 2));
    console.log('  Contact:', JSON.stringify(contact, null, 2));
    
    console.log('🌐 Seeru Client Config:');
    console.log('  Base URL:', seeruClient.defaults.baseURL);
    console.log('  Auth Header:', seeruClient.defaults.headers.Authorization ? '✅ Set' : '❌ Missing');
    
    const response = await seeruClient.post('/booking/save', payloadToSend);

    console.log('📥 Seeru Response Status:', response.status);
    console.log('📥 Seeru Response Data:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.status === 'success') {
      console.log('✅ Booking saved successfully. Order ID:', response.data.order_id);
      return {
        success: true,
        orderId: response.data.order_id,
        message: response.data.message,
        data: response.data
      };
    } else {
      console.error('❌ Booking save failed:', response.data);
      return {
        success: false,
        error: response.data?.message || response.data?.error || 'Booking save failed'
      };
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
    console.error('❌ Seeru booking save error:', errorMsg);
    console.error('📥 Error details:', JSON.stringify(error.response?.data || error.message, null, 2));
    console.error('📥 Error status:', error.response?.status);
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Issue ticket with Seeru
 * @param {string} orderId - Order ID from save booking
 * @returns {Promise<Object>} - Ticket issuance response
 */
async function issueTicket(orderId) {
  try {
    console.log('Issuing ticket with Seeru for order:', orderId);
    const response = await seeruClient.post(`/booking/issue/${orderId}`);

    if (response.data && response.data.status === 'success') {
      console.log('Ticket issued successfully');
      return {
        success: true,
        ticketNumber: response.data.ticket_number,
        pnr: response.data.pnr,
        data: response.data
      };
    } else {
      console.error('Ticket issuance failed:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Ticket issuance failed'
      };
    }
  } catch (error) {
    console.error('Seeru ticket issuance error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get order details from Seeru
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - Order details
 */
async function getOrderDetails(orderId) {
  try {
    console.log('Fetching order details from Seeru:', orderId);
    const response = await seeruClient.post('/order/details', {
      order_id: orderId
    });

    if (response.data && response.data.status === 'success') {
      console.log('Order details retrieved successfully');
      return {
        success: true,
        data: response.data
      };
    } else {
      console.error('Failed to get order details:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to get order details'
      };
    }
  } catch (error) {
    console.error('Seeru get order error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Cancel order with Seeru
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - Cancel response
 */
async function cancelOrder(orderId) {
  try {
    console.log('Cancelling order with Seeru:', orderId);
    const response = await seeruClient.post('/order/cancel', {
      order_id: orderId
    });

    if (response.data && response.data.status === 'success') {
      console.log('Order cancelled successfully');
      return {
        success: true,
        message: response.data.message
      };
    } else {
      console.error('Failed to cancel order:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to cancel order'
      };
    }
  } catch (error) {
    console.error('Seeru cancel order error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Issue order with Seeru (for already saved bookings)
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - Issue response with ticket details
 */
async function issueOrder(orderId) {
  try {
    console.log('🎫 Issuing order with Seeru:', orderId);
    const response = await seeruClient.post('/order/issue', {
      order_id: orderId
    });

    if (response.data && response.data.status === 'success') {
      console.log('✅ Order issued successfully from Seeru');
      
      // Extract ticket details from response
      const ticketData = response.data.data || response.data;
      
      return {
        success: true,
        message: response.data.message,
        ticketNumber: ticketData.ticket_number || ticketData.ticketNumber,
        pnr: ticketData.pnr,
        ticketUrl: ticketData.ticket_url || ticketData.ticketUrl,
        status: 'issued',
        issuedAt: new Date()
      };
    } else {
      console.error('❌ Failed to issue order:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to issue order'
      };
    }
  } catch (error) {
    console.error('❌ Seeru issue order error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Get ticket details by ticket ID
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} - Ticket details
 */
async function getTicketDetails(ticketId) {
  try {
    console.log('Fetching ticket details:', ticketId);
    const response = await seeruClient.post('/ticket/details', {
      ticket_id: ticketId
    });

    if (response.data && response.data.status === 'success') {
      console.log('Ticket details retrieved successfully');
      return {
        success: true,
        data: response.data
      };
    } else {
      console.error('Failed to get ticket details:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to get ticket details'
      };
    }
  } catch (error) {
    console.error('Seeru get ticket error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Retrieve ticket by PNR and last name
 * @param {string} airlinePnr - Airline PNR
 * @param {string} lastName - Passenger last name
 * @returns {Promise<Object>} - Ticket details
 */
async function retrieveTicketByPnr(airlinePnr, lastName) {
  try {
    console.log('Retrieving ticket by PNR:', airlinePnr);
    const response = await seeruClient.post('/ticket/retrieve', {
      airline_pnr: airlinePnr,
      last_name: lastName
    });

    if (response.data && response.data.status === 'success') {
      console.log('Ticket retrieved successfully');
      return {
        success: true,
        data: response.data
      };
    } else {
      console.error('Failed to retrieve ticket:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to retrieve ticket'
      };
    }
  } catch (error) {
    console.error('Seeru retrieve ticket error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Refund ticket
 * @param {string} ticketId - Ticket ID
 * @param {Array} legs - Legs to refund (optional)
 * @param {number} totalFees - Total fees (optional)
 * @param {Array} passengers - Passenger IDs (optional)
 * @returns {Promise<Object>} - Refund response
 */
async function refundTicket(ticketId, legs = [], totalFees = null, passengers = []) {
  try {
    console.log('Refunding ticket:', ticketId);
    const response = await seeruClient.post('/ticket/refund', {
      ticket_id: ticketId,
      legs,
      total_fees: totalFees,
      passengers
    });

    if (response.data && response.data.status === 'success') {
      console.log('Ticket refunded successfully');
      return {
        success: true,
        message: response.data.message
      };
    } else {
      console.error('Failed to refund ticket:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to refund ticket'
      };
    }
  } catch (error) {
    console.error('Seeru refund ticket error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Void ticket
 * @param {string} ticketId - Ticket ID
 * @param {Array} passengers - Passenger IDs (optional)
 * @returns {Promise<Object>} - Void response
 */
async function voidTicket(ticketId, passengers = []) {
  try {
    console.log('Voiding ticket:', ticketId);
    const response = await seeruClient.post('/ticket/void', {
      ticket_id: ticketId,
      passengers
    });

    if (response.data && response.data.status === 'success') {
      console.log('Ticket voided successfully');
      return {
        success: true,
        message: response.data.message
      };
    } else {
      console.error('Failed to void ticket:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to void ticket'
      };
    }
  } catch (error) {
    console.error('Seeru void ticket error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Exchange ticket
 * @param {string} ticketId - Ticket ID
 * @param {Array} exchangeLegs - Legs to exchange
 * @param {number} totalFees - Total fees
 * @param {Array} passengers - Passenger IDs (optional)
 * @returns {Promise<Object>} - Exchange response
 */
async function exchangeTicket(ticketId, exchangeLegs, totalFees, passengers = []) {
  try {
    console.log('Exchanging ticket:', ticketId);
    const response = await seeruClient.post('/ticket/exchange', {
      ticket_id: ticketId,
      exchange_legs: exchangeLegs,
      total_fees: totalFees,
      passengers
    });

    if (response.data && response.data.status === 'success') {
      console.log('Ticket exchanged successfully');
      return {
        success: true,
        message: response.data.message
      };
    } else {
      console.error('Failed to exchange ticket:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Failed to exchange ticket'
      };
    }
  } catch (error) {
    console.error('Seeru exchange ticket error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

/**
 * Clean legs data - remove extra fields that might cause issues
 * @param {Array} legs - Raw legs data
 * @returns {Array} - Cleaned legs data
 */
function cleanLegsData(legs) {
  if (!Array.isArray(legs)) return [];
  
  return legs.map(leg => ({
    leg_id: leg.leg_id || '',
    duration: leg.duration || 0,
    bags: leg.bags || {},
    segments: (leg.segments || []).map(segment => ({
      cabin: segment.cabin || '',
      cabin_name: segment.cabin_name || '',
      farebase: segment.farebase || '',
      seats: segment.seats || '',
      class: segment.class || '',
      from: segment.from || {},
      to: segment.to || {},
      equipment: segment.equipment || '',
      equipment_name: segment.equipment_name || '',
      flightnumber: segment.flightnumber || '',
      iata: segment.iata || '',
      airline_name: segment.airline_name || '',
      duration: segment.duration || 0
    })),
    from: leg.from || {},
    to: leg.to || {},
    cabin: leg.cabin || '',
    seats: leg.seats || 0,
    iata: leg.iata || [],
    stops: leg.stops || [],
    stop_over: leg.stop_over || [],
    cabin_name: leg.cabin_name || ''
  }));
}

/**
 * Transform flight booking to Seeru format
 * @param {Object} flightBooking - Flight booking from database
 * @returns {Object} - Transformed booking data for Seeru
 */
function transformBookingToSeeru(flightBooking) {
  console.log('🔄 Transforming booking to Seeru format...');
  console.log('📋 Booking ID:', flightBooking.bookingId);
  console.log('📋 Booking fareKey:', flightBooking.fareKey);
  
  // Extract flight details
  const flightDetails = flightBooking.flightDetails || {};
  const selectedFlight = flightDetails.selectedFlight || {};
  const rawSelectedFlight = selectedFlight.raw || {};
  const price = selectedFlight.price || flightBooking.price || {};
  const priceBreakdowns = flightBooking.priceBreakdowns || rawSelectedFlight.price_breakdowns || selectedFlight.price_breakdowns || {};
  
  // Get passenger counts from flightDetails.passengers
  const passengerCounts = flightDetails.passengers || { adults: 1, children: 0, infants: 0 };
  const totalPassengers = (passengerCounts.adults || 1) + (passengerCounts.children || 0);
  
  // Extract legs from raw flight data if available
  let legs = [];
  if (selectedFlight.raw && selectedFlight.raw.legs) {
    legs = cleanLegsData(selectedFlight.raw.legs);
  } else if (flightDetails.legs) {
    legs = cleanLegsData(flightDetails.legs);
  } else if (selectedFlight.legs) {
    legs = cleanLegsData(selectedFlight.legs);
  }
  
  // Build search query from flight details
  const searchQuery = {
    trips: [{
      from: flightDetails.from || '',
      to: flightDetails.to || '',
      date: flightDetails.departureDate ? new Date(flightDetails.departureDate).toISOString().split('T')[0] : ''
    }],
    adt: passengerCounts.adults || 1,
    chd: passengerCounts.children || 0,
    inf: passengerCounts.infants || 0,
    options: {
      direct: flightDetails.direct || false,
      cabin: flightDetails.cabin || selectedFlight.class || 'e',
      multiCity: false
    }
  };
  
  const transformed = {
    price: typeof price === 'object' ? (price.total || 0) : (price || 0),
    tax: typeof price === 'object' ? (price.tax || 0) : 0,
    refundable_info: flightBooking.refundable ? 'Refundable' : 'Non-Refundable',
    fare_key: flightBooking.fareKey || selectedFlight.fareKey || '',
    fare_brand: flightBooking.fareBrand || selectedFlight.fareBrand || rawSelectedFlight.fare_brand || 'ECONOMY',
    price_breakdowns: priceBreakdowns,
    legs: legs,
    trip_id: selectedFlight.tripId || selectedFlight.trip_id || rawSelectedFlight.trip_id || selectedFlight.flightId || '',
    // Prefer original Seeru search_id from raw result if present, then any explicit field on flightDetails/selectedFlight
    search_id: rawSelectedFlight.search_id || flightDetails.searchId || selectedFlight.search_id || '',
    src: flightBooking.src || 'TOURTASTIC',
    // Prefer original Seeru flight id if available
    id: rawSelectedFlight.id || flightBooking._id?.toString() || '',
    total_pax_no_inf: totalPassengers,
    search_query: searchQuery,
    currency: typeof price === 'object' ? (price.currency || 'USD') : 'USD',
    can_hold: true,
    can_void: true,
    can_refund: flightBooking.refundable || false,
    can_exchange: true,
    etd: flightDetails.departureDate ? new Date(flightDetails.departureDate).toISOString() : ''
  };
  
  console.log('✅ Transformed booking data:', JSON.stringify(transformed, null, 2));
  return transformed;
}

/**
 * Convert country name to ISO 3166-1 alpha-2 code
 * @param {string} countryName - Country name or code
 * @returns {string} - ISO country code
 */
function getCountryISOCode(countryName) {
  if (!countryName) return 'SY'; // Default fallback
  
  const countryMap = {
    // Common names and variations
    'egypt': 'EG', 'egyptian': 'EG', 'eg': 'EG',
    'saudi arabia': 'SA', 'saudi': 'SA', 'sa': 'SA',
    'united arab emirates': 'AE', 'uae': 'AE', 'ae': 'AE',
    'jordan': 'JO', 'jo': 'JO',
    'lebanon': 'LB', 'lb': 'LB',
    'syria': 'SY', 'syrian': 'SY', 'sy': 'SY',
    'iraq': 'IQ', 'iq': 'IQ',
    'kuwait': 'KW', 'kw': 'KW',
    'bahrain': 'BH', 'bh': 'BH',
    'qatar': 'QA', 'qa': 'QA',
    'oman': 'OM', 'om': 'OM',
    'yemen': 'YE', 'ye': 'YE',
    'palestine': 'PS', 'ps': 'PS',
    'israel': 'IL', 'il': 'IL',
    'turkey': 'TR', 'turkish': 'TR', 'tr': 'TR',
    'iran': 'IR', 'ir': 'IR',
    'afghanistan': 'AF', 'af': 'AF',
    'pakistan': 'PK', 'pk': 'PK',
    'india': 'IN', 'in': 'IN',
    'bangladesh': 'BD', 'bd': 'BD',
    'sri lanka': 'LK', 'lk': 'LK',
    'thailand': 'TH', 'th': 'TH',
    'malaysia': 'MY', 'my': 'MY',
    'singapore': 'SG', 'sg': 'SG',
    'indonesia': 'ID', 'id': 'ID',
    'philippines': 'PH', 'ph': 'PH',
    'vietnam': 'VN', 'vn': 'VN',
    'china': 'CN', 'cn': 'CN',
    'japan': 'JP', 'jp': 'JP',
    'south korea': 'KR', 'korea': 'KR', 'kr': 'KR',
    'united kingdom': 'GB', 'uk': 'GB', 'gb': 'GB',
    'france': 'FR', 'fr': 'FR',
    'germany': 'DE', 'de': 'DE',
    'italy': 'IT', 'it': 'IT',
    'spain': 'ES', 'es': 'ES',
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'canada': 'CA', 'ca': 'CA',
    'australia': 'AU', 'au': 'AU',
  };
  
  const normalized = countryName.toLowerCase().trim();
  return countryMap[normalized] || (normalized.length === 2 ? normalized.toUpperCase() : 'SY');
}

/**
 * Transform passengers to Seeru format
 * @param {Array} passengers - Passengers array
 * @returns {Array} - Transformed passengers for Seeru
 */
function transformPassengersToSeeru(passengers) {
  if (!Array.isArray(passengers) || passengers.length === 0) {
    // Return at least one placeholder passenger if none provided
    return [{
      pax_id: 'PAX1',
      type: 'ADT',
      first_name: 'Passenger',
      last_name: 'One',
      gender: 'M',
      birth_date: '',
      document_type: 'PP',
      document_number: '',
      document_expiry: '',
      document_country: 'SY',
      nationality: 'SY'
    }];
  }

  return passengers.map((pax, index) => {
    // Convert country names to ISO codes
    const documentCountry = pax.documentCountry || pax.document_country || pax.passportCountry || '';
    const nationality = pax.nationality || '';
    
    const documentCountryISO = getCountryISOCode(documentCountry);
    const nationalityISO = getCountryISOCode(nationality);
    
    // Format dates to YYYY-MM-DD
    const formatDate = (date) => {
      if (!date) return '';
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0]; // Returns YYYY-MM-DD
      } catch (e) {
        return '';
      }
    };
    
    // Handle all possible field name variations from frontend and database
    const birthDate = pax.birthDate || pax.birth_date || pax.dob || '';
    const documentNumber = pax.documentNumber || pax.document_number || pax.passportNumber || '';
    const documentExpiry = pax.documentExpiry || pax.document_expiry || pax.passportExpiryDate || '';
    const documentIssue = pax.documentIssueDate || pax.document_issue_date || pax.passportIssueDate || '';
    
    console.log(`📍 Passenger ${index + 1} - Converting data for Seeru:`);
    console.log(`  Name: ${pax.firstName || ''} ${pax.lastName || ''}`);
    console.log(`  Gender: ${pax.gender}`);
    console.log(`  Birth Date: "${birthDate}" → "${formatDate(birthDate)}"`);
    console.log(`  Document Number: "${documentNumber}"`);
    console.log(`  Document Country: "${documentCountry}" → "${documentCountryISO}"`);
    console.log(`  Nationality: "${nationality}" → "${nationalityISO}"`);
    console.log(`  Document Issue: "${documentIssue}" → "${formatDate(documentIssue)}"`);
    console.log(`  Document Expiry: "${documentExpiry}" → "${formatDate(documentExpiry)}"`);
    
    return {
      pax_id: pax.paxId || pax.pax_id || `PAX${index + 1}`,
      type: pax.type === 'adult' ? 'ADT' : (pax.type === 'child' ? 'CHD' : (pax.type || 'ADT')),
      first_name: pax.firstName || pax.first_name || `Passenger${index + 1}`,
      last_name: pax.lastName || pax.last_name || 'Traveler',
      gender: pax.gender === 'F' ? 'F' : 'M', // Ensure valid gender
      birth_date: formatDate(birthDate),
      document_type: pax.documentType || pax.document_type || 'PP',
      document_number: documentNumber,
      document_expiry: formatDate(documentExpiry),
      document_country: documentCountryISO,
      nationality: nationalityISO
    };
  });
}

/**
 * Transform contact to Seeru format
 * @param {Object} contact - Contact information
 * @returns {Object} - Transformed contact for Seeru
 */
function transformContactToSeeru(contact) {
  const mobile = contact.mobile || contact.phone || '';
  const email = contact.email || '';
  
  // Seeru requires both email and mobile - use defaults if missing
  return {
    full_name: contact.fullName || contact.full_name || contact.name || 'Guest',
    email: email || 'noemail@example.com', // Fallback email if not provided
    mobile: mobile || '+1234567890' // Fallback mobile if not provided
  };
}

module.exports = {
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
  transformContactToSeeru,
  getCountryISOCode,
  seeruClient
};
