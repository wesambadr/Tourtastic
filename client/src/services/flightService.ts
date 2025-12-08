import api  from '../config/api';

export interface FlightSearchInputSegment {
  from: string;
  to: string;
  date: string;
}

export interface PassengerCount {
  adults: number;
  children: number;
  infants: number;
}

export interface FlightSearchParams {
  flightSegments: FlightSearchInputSegment[];
  passengers: PassengerCount;
  cabin?: 'e' | 'p' | 'b' | 'f'; // e: Economy, p: PremiumEconomy, b: Business, f: First
  direct?: boolean;
}

export interface FlightSearchResponse {
  search_id: string;
}

// Fixed FlightSearchResults interface to match backend response
export interface FlightSearchResults {
  complete: number; // Progress percentage (0-100)
  result: Flight[]; // Array of flights
  last_result: number; // Last result index for pagination
  status?: 'ok' | 'no_results'; // Search status
  message?: string; // Optional status message
}

export interface Airport {
  date: string;
  airport: string;
  city: string;
  country: string;
  country_iso: string;
  terminal: string;
  airport_name: string;
  // Optional IATA fields that may be present on flight result airports
  iata?: string;
  iata_code?: string;
}

export interface BaggageInfo {
  cabin: {
    desc: string;
  };
  checked: {
    desc: string;
  };
}

export interface PriceBreakdown {
  total: number;
  price: number;
  label: string;
  tax: number;
}

export interface FlightSegment {
  cabin: string;
  cabin_name: string;
  farebase: string;
  seats: string;
  class: string;
  from: Airport;
  to: Airport;
  equipment: string;
  equipment_name: string;
  flightnumber: string;
  iata: string;
  airline_name: string;
  duration: number;
  // Enhanced fields
  airline_code?: string;
  airline_iata?: string;
  duration_formatted?: string;
}

export interface FlightLeg {
  leg_id: string;
  duration: number;
  bags: {
    ADT: BaggageInfo;
    CHD: BaggageInfo;
    INF: BaggageInfo;
  };
  segments: FlightSegment[];
  from: Airport;
  to: Airport;
  cabin: string;
  seats: number;
  iata: string[];
  stops: string[];
  stop_over: string[];
  cabin_name: string;
  // Enhanced fields
  duration_formatted?: string;
  stops_count?: number;
  stops_info?: Array<{
    airport: string;
    city: string;
    duration?: string;
  }>;
  airline_name?: string;
  main_airline_code?: string;
}

// Fixed Flight interface with all required properties
export interface Flight {
  // Required properties that were missing
  trip_id: string;
  id: string; // Unique flight identifier from Seeru (used as fare_key)
  search_id?: string; // Search ID from Seeru
  src?: string; // Source provider
  search_query: {
    adt: number;
    chd: number;
    inf: number;
    options: {
      cabin: string;
      direct?: boolean;
      multiCity?: boolean;
    };
  };
  currency: string;
  
  // Existing properties
  price: number;
  tax: number;
  refundable_info: string;
  fare_key: string;
  fare_brand: string;
  price_breakdowns: {
    ADT: PriceBreakdown;
    CHD: PriceBreakdown;
    INF: PriceBreakdown;
  };

  // Add these new fields
  total_price?: number; // Pre-calculated total from backend
  cabin_class?: string; // Flight-level cabin class
  carry_on_baggage?: string;
  checked_baggage?: string;
  airline_logo_url?: string;
  departure_time_formatted?: string;
  arrival_time_formatted?: string;
  layover_details?: Array<{
    airport: string;
    city: string;
    duration: string;
    terminal?: string;
  }>;
  
  // Enhanced fields
  airline_name?: string;
  airline_code?: string;
  total_duration?: number;
  total_duration_formatted?: string;
  stops_count?: number;
  baggage_allowance?: string;
  segment_index?: number;
  
  // Add missing booking-related properties
  can_refund?: boolean;
  can_hold?: boolean;
  can_void?: boolean;
  can_exchange?: boolean;
  
  // Enhanced leg information
  legs: FlightLeg[];
}

export const searchFlights = async (params: FlightSearchParams): Promise<FlightSearchResponse> => {
  // Format trips string according to Seeru API format: ORIGIN-DESTINATION-DATE
  const tripsString = params.flightSegments
    .map(segment => {
      // Ensure the date is in YYYY-MM-DD format
      const formattedDate = segment.date.replace(/-/g, '');
      return `${segment.from}-${segment.to}-${formattedDate}`;
    })
    .join(':');

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await api.get(`/flights/search/${tripsString}/${params.passengers.adults}/${params.passengers.children}/${params.passengers.infants}`, {
        params: {
          cabin: params.cabin || 'e',
          direct: params.direct ? 1 : 0
        }
      });
      return response.data;
    } catch (error) {
      retries--;

      if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
        if (retries > 0) {
          continue;
        }
        throw new Error('Flight search timed out. Please try again with fewer search parameters.');
      }

      if (error.response?.status === 429) {
        if (retries > 0) {
          continue;
        }
        throw new Error('Too many requests. Please wait a moment before trying again.');
      }

      if (retries === 0) {
        console.error('Error searching flights:', error);
        throw error;
      }
    }
  }

  throw new Error('Flight search failed after multiple attempts.');
};

// Add simple cache for search results
const searchCache = new Map<string, { data: FlightSearchResults; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getSearchResults = async (searchId: string, after?: number): Promise<FlightSearchResults> => {
  const cacheKey = `${searchId}-${after || 0}`;
  const cached = searchCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  let retries = 3;
  let lastError: unknown = null;
  
  while (retries > 0) {
    try {
      const response = await api.get(`/flights/results/${searchId}`, {
        params: after ? { after } : undefined
      });
      
      // Validate response structure
      if (!response.data || typeof response.data.complete !== 'number') {
        throw new Error('Invalid response structure from flight search API');
      }

      const data = {
        ...response.data,
        status: response.data.status || 'ok',
        message: response.data.message
      };
      
      searchCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
      
    } catch (error) {
      lastError = error;
      retries--;
      
      if (error.response?.status === 404) {
        throw new Error('Search results not found or expired');
      }
      
      if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
        if (retries > 0) {
          continue;
        }
        throw new Error('Timeout while fetching search results. Please try again.');
      }
      
      if (retries === 0) {
        console.error('Error fetching search results:', error);
        throw lastError;
      }
    }
  }
  
  throw lastError;
};
