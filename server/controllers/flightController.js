const axios = require('axios');
const asyncHandler = require('../middleware/asyncHandler');
const SearchLog = require('../models/SearchLog');

// Seeru API configuration
const seeruBaseURL = `https://${process.env.SEERU_API_ENDPOINT}/${process.env.SEERU_API_VERSION}/flights`;
const seeruApiKey = process.env.SEERU_API_KEY;

// Helper function to get configured axios instance for Seeru API
// Helper function to get configured axios instance for Seeru API
const getSeeruApiInstance = () => {
  return axios.create({
    baseURL: seeruBaseURL,
    headers: {
      'Authorization': `Bearer ${seeruApiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000, // 30 seconds timeout
    retry: 3, // Retry failed requests 3 times
    retryDelay: 1000 // 1 second delay between retries
  });
};

// @desc    Search for flights using Seeru API
// @route   GET /api/flights/search/:trips/:adults/:children/:infants
// @access  Public
// Add timeout configuration to Seeru API calls
const seeruApiConfig = {
  timeout: 15000, // 15 seconds timeout for quicker feedback
  retry: 2,
  retryDelay: 1000,
  maxEmptyPolls: 5 // Stop after 5 empty results
};

// Update the searchFlights function to use timeout
exports.searchFlights = asyncHandler(async (req, res) => {
  const { trips, adults, children, infants } = req.params;
  const { cabin = 'e', direct = 0 } = req.query;

  // Validate passenger counts
  const totalPassengers = parseInt(adults) + parseInt(children) + parseInt(infants);
  if (totalPassengers > 9) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 9 passengers allowed for optimal performance'
    });
  }

  try {
    // Persist search log (best-effort, non-blocking)
    try {
      // trips format: ORG-DEST-YYYYMMDD(:...)
      const firstTrip = String(trips || '').split(':')[0] || '';
      const parts = firstTrip.split('-');
      const from = (parts[0] || '').toUpperCase();
      const to = (parts[1] || '').toUpperCase();
      const dateStr = parts[2];
      const searchedAt = dateStr && dateStr.length >= 8
        ? new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}T00:00:00Z`)
        : new Date();
      await SearchLog.create({
        from,
        to,
        searchedAt,
        resultsCount: 1,
        ip: req.ip,
        meta: { cabin, direct: Number(direct) === 1, adults: Number(adults), children: Number(children), infants: Number(infants) }
      });
    } catch (e) {
      // do not fail search on log error
      console.warn('SearchLog insert failed:', e?.message || e);
    }

    // Use environment variables for the correct API endpoint
    const seeruResponse = await axios.get(
      `https://${process.env.SEERU_API_ENDPOINT}/${process.env.SEERU_API_VERSION}/flights/search/${trips}/${adults}/${children}/${infants}?cabin=${cabin}&direct=${direct}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SEERU_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: seeruApiConfig.timeout
      }
    );

    res.json({
      success: true,
      search_id: seeruResponse.data.search_id,
      message: 'Search initiated successfully'
    });
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        message: 'Search request timed out. Please try again with fewer passengers.'
      });
    }
    
    console.error('Seeru API Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate flight search'
    });
  }
});

// @desc    Get search results from Seeru API
// @route   GET /api/flights/results/:searchId
// @access  Public
exports.getFlightSearchResults = asyncHandler(async (req, res) => {
  const { searchId } = req.params;
  const { after } = req.query;
  
  if (!searchId) {
    return res.status(400).json({
      success: false,
      message: 'Search ID is required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    // Build the result URL according to Seeru API format
    // GET /result/{search_id}
    const resultUrl = `/result/${searchId}`;
    
    const params = {};
    if (after) {
      params.after = parseInt(after);
    }
    
    const response = await seeruApi.get(resultUrl, { params });

    // Normalize complete and last_result exactly as reported by Seeru
    // Do NOT force completion early based on partial progress and empty results.
    const completePercent = typeof response.data.complete === 'number'
      ? response.data.complete
      : (response.data.complete ? 100 : 0);
    const lastResult = typeof response.data.last_result === 'number' ? response.data.last_result : undefined;

    // Dedupe by trip_id within this batch in case Seeru returns duplicates in same payload
    const rawResults = Array.isArray(response.data.result) ? response.data.result : [];
    const tripIdToTransformed = new Map();
    rawResults.forEach((flight, index) => {
      // Determine segment index based on trip structure (best-effort; single-trip searches will be 0)
      const tripsLen = Array.isArray(flight?.search_query?.trips) ? flight.search_query.trips.length : 1;
      const segmentIndex = tripsLen > 1 && rawResults.length > 0
        ? Math.floor(index / (rawResults.length / tripsLen))
        : 0;
      const transformed = transformSeeruToFrontendFormat(flight, segmentIndex);
      if (transformed && transformed.trip_id) {
        // Last occurrence wins per Seeru doc (newer updates replace older)
        tripIdToTransformed.set(transformed.trip_id, transformed);
      }
    });

    const transformedFlights = Array.from(tripIdToTransformed.values());

    // Only treat the search as definitively having no results when Seeru
    // reports completion (100%) AND there are still no flights.
    const isDefinitiveNoResults = transformedFlights.length === 0 && completePercent >= 100;

    const transformedResults = {
      complete: completePercent,
      result: transformedFlights,
      last_result: lastResult,
      status: isDefinitiveNoResults ? 'no_results' : 'ok'
    };
    
    if (isDefinitiveNoResults) {
      transformedResults.message = 'No flights found for this route and date combination.';
    }
    
    res.status(200).json(transformedResults);
    
  } catch (error) {
    console.error('Seeru API results error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Search results not found or expired'
      });
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error retrieving search results',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to standardize baggage allowance format
function formatBaggageAllowance(baggageDesc) {
  if (!baggageDesc || baggageDesc === '0' || baggageDesc === '0 kg') {
    return 'No baggage included';
  }
  
  // Convert various formats to standardized format
  const desc = String(baggageDesc).toLowerCase();
  
  // Handle piece-based baggage
  if (desc.includes('pc') || desc.includes('piece')) {
    const pieceMatch = desc.match(/(\d+)\s*(pc|piece)/i);
    if (pieceMatch) {
      const count = parseInt(pieceMatch[1]);
      return count === 1 ? '1 piece (23kg)' : `${count} pieces (23kg each)`;
    }
    return '1 piece (23kg)';
  }
  
  // Handle weight-based baggage
  if (desc.includes('kg')) {
    const kgMatch = desc.match(/(\d+)\*?\s*kg/i);
    if (kgMatch) {
      return `${kgMatch[1]}kg`;
    }
  }
  
  // Handle other formats
  if (desc.includes('x')) {
    const xMatch = desc.match(/(\d+)\s*x\s*(\d+)\s*kg/i);
    if (xMatch) {
      return `${xMatch[1]} × ${xMatch[2]}kg`;
    }
  }
  
  // Return original if no pattern matches, but clean it up
  return baggageDesc.replace(/\*/g, '').trim() || 'Standard baggage';
}

// Helper function to round price to 2 decimal places
function roundPrice(price) {
  return Math.round((parseFloat(price) || 0) * 100) / 100;
}

// Helper function to transform Seeru response to frontend format
function transformSeeruToFrontendFormat(seeruFlight, segmentIndex = 0) {
  // Add null checks for seeruFlight
  if (!seeruFlight) {
    console.error('seeruFlight is null or undefined');
    return null;
  }

  // Cache passenger counts
  const adtCount = seeruFlight.search_query?.adt || 1;
  const chdCount = seeruFlight.search_query?.chd || 0;
  const infCount = seeruFlight.search_query?.inf || 0;
  
  // Helper function to get cabin name from cabin code
  const getCabinName = (cabinCode) => {
    const cabinMap = {
      'e': 'Economy',
      'p': 'Premium Economy', 
      'b': 'Business',
      'f': 'First Class'
    };
    return cabinMap[cabinCode?.toLowerCase()] || 'Economy';
  };
  
  // Fix: Use consistent price calculation logic
  // The price and tax from Seeru should represent the TOTAL for all passengers, not per passenger
  const totalPrice = roundPrice(seeruFlight.price || 0);
  const totalTax = roundPrice(seeruFlight.tax || 0);
  const grandTotal = roundPrice(totalPrice + totalTax);
  
  // Calculate per-passenger prices by dividing total by passenger count
  const totalPassengers = adtCount + chdCount + infCount;
  const pricePerPassenger = totalPassengers > 0 ? roundPrice(totalPrice / totalPassengers) : totalPrice;
  const taxPerPassenger = totalPassengers > 0 ? roundPrice(totalTax / totalPassengers) : totalTax;
  const totalPerPassenger = roundPrice(pricePerPassenger + taxPerPassenger);
  
  // Create consistent price breakdowns
  let priceBreakdowns;
  
  if (seeruFlight.price_breakdowns && typeof seeruFlight.price_breakdowns === 'object') {
    // Use existing price breakdowns if available, but ensure consistency
    priceBreakdowns = {
      ADT: {
        total: roundPrice(seeruFlight.price_breakdowns.ADT?.total || totalPerPassenger),
        price: roundPrice(seeruFlight.price_breakdowns.ADT?.price || pricePerPassenger),
        label: seeruFlight.price_breakdowns.ADT?.label || 'Adult',
        tax: roundPrice(seeruFlight.price_breakdowns.ADT?.tax || taxPerPassenger)
      },
      CHD: {
        total: roundPrice(seeruFlight.price_breakdowns.CHD?.total || (totalPerPassenger * 0.75)),
        price: roundPrice(seeruFlight.price_breakdowns.CHD?.price || (pricePerPassenger * 0.75)),
        label: seeruFlight.price_breakdowns.CHD?.label || 'Child',
        tax: roundPrice(seeruFlight.price_breakdowns.CHD?.tax || (taxPerPassenger * 0.75))
      },
      INF: {
        total: roundPrice(seeruFlight.price_breakdowns.INF?.total || (totalPerPassenger * 0.1)),
        price: roundPrice(seeruFlight.price_breakdowns.INF?.price || (pricePerPassenger * 0.1)),
        label: seeruFlight.price_breakdowns.INF?.label || 'Infant',
        tax: roundPrice(seeruFlight.price_breakdowns.INF?.tax || (taxPerPassenger * 0.1))
      }
    };
  } else {
    // Create fallback price breakdowns with consistent logic
    priceBreakdowns = {
      ADT: { 
        total: totalPerPassenger,
        price: pricePerPassenger, 
        label: 'Adult', 
        tax: taxPerPassenger 
      },
      CHD: { 
        total: roundPrice(totalPerPassenger * 0.75),
        price: roundPrice(pricePerPassenger * 0.75), 
        label: 'Child', 
        tax: roundPrice(taxPerPassenger * 0.75) 
      },
      INF: { 
        total: roundPrice(totalPerPassenger * 0.1),
        price: roundPrice(pricePerPassenger * 0.1), 
        label: 'Infant', 
        tax: roundPrice(taxPerPassenger * 0.1) 
      }
    };
  }
  
  // Calculate accurate total price for all passengers using breakdowns
  const calculatedTotalPrice = roundPrice(
    (adtCount * (priceBreakdowns.ADT?.total || 0)) +
    (chdCount * (priceBreakdowns.CHD?.total || 0)) +
    (infCount * (priceBreakdowns.INF?.total || 0))
  );
  
  // Get standardized baggage allowance
  const rawBaggage = seeruFlight.legs && seeruFlight.legs[0] && seeruFlight.legs[0].bags && seeruFlight.legs[0].bags.ADT 
    ? seeruFlight.legs[0].bags.ADT.checked?.desc : null;
  const standardizedBaggage = formatBaggageAllowance(rawBaggage);
  
  return {
    // Core flight information - use per-passenger prices for display consistency
    price: pricePerPassenger,  // Price per passenger for display
    tax: taxPerPassenger,      // Tax per passenger for display
    total_price: calculatedTotalPrice,  // Correct total for all passengers
    
    // Price breakdowns with correct calculations
    price_breakdowns: priceBreakdowns,
    
    // Flight legs with enhanced information
    legs: (seeruFlight.legs || []).map(leg => {
      // Compute leg duration minutes if missing or zero using first segment from/to
      let legDuration = leg.duration || 0;
      if ((!legDuration || legDuration === 0) && Array.isArray(leg.segments) && leg.segments.length > 0) {
        const firstSeg = leg.segments[0];
        const lastSeg = leg.segments[leg.segments.length - 1];
        const computed = computeDurationMinutes(firstSeg.from?.date, lastSeg.to?.date);
        if (computed > 0) legDuration = computed;
      }

      return {
        ...leg,
        duration: legDuration,
        duration_formatted: formatMinutesToHoursMinutes(legDuration),
        stops_count: leg.stops ? leg.stops.length : 0,

        // Add cabin_name to leg
        cabin_name: getCabinName(leg.cabin || seeruFlight.search_query?.options?.cabin),

        // Enhanced stops information
        stops_info: leg.stops ? leg.stops.map((stop, index) => ({
          airport: stop,
          city: leg.stop_over?.[index] || stop,
          duration: '45m'
        })) : [],

        // Enhanced segments with airline names and cabin info
        segments: (leg.segments || []).map(segment => {
          // Compute segment duration if missing
          let segDuration = segment.duration || 0;
          if ((!segDuration || segDuration === 0) && segment.from?.date && segment.to?.date) {
            const computedSeg = computeDurationMinutes(segment.from.date, segment.to.date);
            if (computedSeg > 0) segDuration = computedSeg;
          }

          return {
            ...segment,
            airline_name: getAirlineName(segment.iata),
            duration: segDuration,
            duration_formatted: formatMinutesToHoursMinutes(segDuration),
            cabin_name: getCabinName(segment.cabin || leg.cabin || seeruFlight.search_query?.options?.cabin)
          };
        }),

        // Add main airline information
        airline_name: leg.segments && leg.segments.length > 0 ? getAirlineName(leg.segments[0].iata) : '',
        main_airline_code: leg.segments && leg.segments.length > 0 ? leg.segments[0].iata : ''
      };
    }),
    
    // Flight identifiers
    trip_id: seeruFlight.trip_id,
    search_id: seeruFlight.search_id,
    src: seeruFlight.src || 'seeru',
    id: seeruFlight.id,
    
    // Passenger and search information
    total_pax_no_inf: seeruFlight.total_pax_no_inf || 0,
    search_query: {
      adt: adtCount,
      chd: chdCount,
      inf: infCount,
      options: {
        cabin: seeruFlight.search_query?.options?.cabin || 'e',
        direct: seeruFlight.search_query?.options?.direct || false,
        multiCity: seeruFlight.search_query?.options?.multiCity || false
      },
      trips: seeruFlight.search_query?.trips || []
    },
    
    // Additional flight details
    currency: seeruFlight.currency || 'USD',
    can_hold: seeruFlight.can_hold || false,
    can_void: seeruFlight.can_void || false,
    can_refund: seeruFlight.can_refund || false,
    can_exchange: seeruFlight.can_exchange || false,
    etd: seeruFlight.etd || '',
    
    // Enhanced fields for better frontend display
    airline_name: seeruFlight.legs && seeruFlight.legs[0] && seeruFlight.legs[0].segments && seeruFlight.legs[0].segments[0] 
      ? getAirlineName(seeruFlight.legs[0].segments[0].iata) : '',
    airline_code: seeruFlight.legs && seeruFlight.legs[0] && seeruFlight.legs[0].segments && seeruFlight.legs[0].segments[0] 
      ? seeruFlight.legs[0].segments[0].iata : '',
    total_duration: seeruFlight.legs && seeruFlight.legs[0] ? seeruFlight.legs[0].duration : 0,
    total_duration_formatted: seeruFlight.legs && seeruFlight.legs[0] 
      ? formatMinutesToHoursMinutes(seeruFlight.legs[0].duration) : '0h 0m',
    stops_count: seeruFlight.legs && seeruFlight.legs[0] && seeruFlight.legs[0].stops 
      ? seeruFlight.legs[0].stops.length : 0,
    baggage_allowance: standardizedBaggage,
    
    // Add cabin class at flight level
    cabin_class: getCabinName(seeruFlight.search_query?.options?.cabin),
    
    // Seeru integration fields
    fare_key: seeruFlight.fare_key || '',
    fare_brand: seeruFlight.fare_brand || 'ECONOMY',
    refundable_info: seeruFlight.refundable_info || 'Non-Refundable',
    
    // Segment index for multi-trip searches (0 for single-trip)
    segment_index: segmentIndex
  };
}

// Helper function to get airline name from IATA code
function getAirlineName(iataCode) {
  const airlineMap = {
    'MS': 'EgyptAir',
    'EK': 'Emirates',
    'TK': 'Turkish Airlines', 
    'QR': 'Qatar Airways',
    'SV': 'Saudi Arabian Airlines',
    'KU': 'Kuwait Airways',
    'GF': 'Gulf Air',
    'UX': 'Air Europa',
    'RJ': 'Royal Jordanian',
    'WY': 'Oman Air',
    'ET': 'Ethiopian Airlines',
    'A3': 'Aegean Airlines',
    'XY': 'Flynas', 
    'VF': 'Ajet',
    'ME': 'Middle East Airlines',
    'EY': 'Etihad Airways',
    'NE': 'Nile Air',
    'NP': 'Nemsa Airlines',
    'AH': 'Air Algerie',
    'X1': 'Hahn Air',
    'JL': 'Japan Airlines',
    'FZ': 'FlyDubai',
    'PK': 'Pakistan Airlines',
    'AI': 'Air India',
    'PC': 'Pegasus Airlines',
    'AZ': 'ITA Airways',
    'XQ': 'SunExpress',
    'KQ': 'Kenya Airways',
    '3U': 'Sichuan Airlines',
    'MH': 'Malaysia Airlines',
    'SM': 'Air Cairo',
    'G9': 'Air Arabia',
    'F3': 'flyadeal',
    'E5': 'Air Arabia Egypt',
    'J9': 'Jazeera Airways',
    'R5': 'Royal Jordanian',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'OS': 'Austrian Airlines',
    'CA': 'Air China',
    'I2': 'Iberia Express',
    'LX': 'Swiss International Air Lines',
    'HU': 'Hainan Airlines',
    'MU': 'China Eastern Airlines',
    'AF': 'Air France',
    'SQ': 'Singapore Airlines',
    'AT': 'Royal Air Maroc',
    '6E': 'IndiGo',
    '9P': 'Fly Jinnah',
    'BS': 'US-Bangla Airlines',
    'IX': 'Air India Express',
    'J2': 'Azerbaijan Airlines',
    'OV': 'SalamAir',
    'EW': 'Eurowings',
    'KL': 'KLM Royal Dutch Airlines',
    'LO': 'LOT Polish Airlines',
    'TO': 'Transavia France',
    'TU': 'Tunisair',
    'VY': 'Vueling'
  };
  return airlineMap[iataCode] || iataCode;
}

// Helper function to format duration from minutes to "Xh Ym" format
function formatMinutesToHoursMinutes(totalMinutes) {
  if (!totalMinutes || totalMinutes === 0) return '0h 0m';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${hours}h ${minutes}m`;
}

// Helper to compute duration in minutes from two ISO date strings (safe fallback)
function computeDurationMinutes(fromDateStr, toDateStr) {
  try {
    const from = new Date(fromDateStr);
    const to = new Date(toDateStr);
    if (!isFinite(from.getTime()) || !isFinite(to.getTime())) return 0;
    const diffMs = to.getTime() - from.getTime();
    if (isNaN(diffMs) || diffMs <= 0) return 0;
    return Math.round(diffMs / 60000);
  } catch (e) {
    return 0;
  }
}

// Legacy functions for backward compatibility (can be removed after full migration)
// These are kept to ensure the application doesn't break during transition

// @desc    Search for flight destinations (Legacy - for backward compatibility)
// @route   GET /api/flights/destinations
// @access  Public
exports.getFlightDestinations = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Flight destinations endpoint has been migrated to Seeru API. Please use the new search endpoints.',
    data: []
  });
});

// @desc    Search for flight offers (Legacy - for backward compatibility)
// @route   GET /api/flights/offers
// @access  Public
exports.getFlightOffers = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Flight offers endpoint has been migrated to Seeru API. Please use the new search endpoints.',
    data: []
  });
});

// @desc    Get flight dates with prices (Legacy - for backward compatibility)
// @route   GET /api/flights/dates
// @access  Public
exports.getFlightDates = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Flight dates endpoint has been migrated to Seeru API. Please use the new search endpoints.',
    data: []
  });
});

// @desc    Validate fare for booking
// @route   POST /api/flights/booking/fare
// @access  Public
exports.validateFare = asyncHandler(async (req, res) => {
  const { booking } = req.body;
  
  if (!booking) {
    return res.status(400).json({
      success: false,
      message: 'Booking data is required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    
    
    const response = await seeruApi.post('/booking/fare', {
      booking: booking
    });
    
    res.status(200).json({
      success: true,
      status: response.data.status,
      booking: response.data.booking
    });
    
  } catch (error) {
    console.error('Seeru fare validation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error validating fare',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Save booking and create order
// @route   POST /api/flights/booking/save
// @access  Public
exports.saveBooking = asyncHandler(async (req, res) => {
  const { booking, passengers, contact } = req.body;
  
  if (!booking || !passengers || !contact) {
    return res.status(400).json({
      success: false,
      message: 'Booking data, passengers, and contact information are required'
    });
  }
  
  // Validate passenger data
  if (!Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one passenger is required'
    });
  }
  
  // Validate contact information
  if (!contact.email || !contact.full_name || !contact.mobile) {
    return res.status(400).json({
      success: false,
      message: 'Contact email, full name, and mobile are required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    
    
    const response = await seeruApi.post('/booking/save', {
      booking: booking,
      passengers: passengers,
      contact: contact
    });
    
    res.status(200).json({
      success: true,
      status: response.data.status,
      message: response.data.message,
      order_id: response.data.order_id
    });
    
  } catch (error) {
    console.error('Seeru booking save error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error saving booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get order details
// @route   POST /api/flights/order/details
// @access  Public
exports.getOrderDetails = asyncHandler(async (req, res) => {
  const { order_id } = req.body;
  
  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    
    
    const response = await seeruApi.post('/order/details', {
      order_id: order_id
    });
    
    res.status(200).json({
      success: true,
      status: response.data.status,
      message: response.data.message,
      order_id: response.data.order_id,
      transactions: response.data.transactions,
      contact: response.data.contact,
      tickets: response.data.tickets
    });
    
  } catch (error) {
    console.error('Seeru order details error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you do not have access to it'
      });
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error retrieving order details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Cancel order
// @route   POST /api/flights/order/cancel
// @access  Public
exports.cancelOrder = asyncHandler(async (req, res) => {
  const { order_id } = req.body;
  
  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    
    
    const response = await seeruApi.post('/order/cancel', {
      order_id: order_id
    });
    
    res.status(200).json({
      success: true,
      status: response.data.status,
      message: response.data.message
    });
    
  } catch (error) {
    console.error('Seeru order cancel error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you do not have access to it'
      });
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error cancelling order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Issue order (ticketing)
// @route   POST /api/flights/order/issue
// @access  Public
exports.issueOrder = asyncHandler(async (req, res) => {
  const { order_id } = req.body;
  
  if (!order_id) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }
  
  try {
    const seeruApi = getSeeruApiInstance();
    
    
    
    const response = await seeruApi.post('/order/issue', {
      order_id: order_id
    });
    
    res.status(200).json({
      success: true,
      status: response.data.status,
      message: response.data.message
    });
    
  } catch (error) {
    console.error('Seeru order issue error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you do not have access to it'
      });
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Error issuing order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
