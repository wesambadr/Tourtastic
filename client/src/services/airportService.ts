import api from '@/config/api';
import { getCapitalAirportFromCoordinates } from './geolocationService';

export interface Airport {
  code?: string;
  name: string;
  name_arbic?: string;
  city?: string;
  country?: string;
  country_arbic?: string;
  latitude?: number;
  longitude?: number;
  iata_code: string;
  // Some payloads use `iata` instead of `iata_code` — accept both
  iata?: string;
  municipality?: string;
  municipality_arbic?: string;
  iso_country?: string;
  type?: string;
  scheduled_service?: string;
}

// Add interface for raw airport data from API
interface RawAirportData {
  iata_code: string;
  name: string;
  municipality: string;
  iso_country: string;
  latitude_deg: string;
  longitude_deg: string;
  type: string;
  scheduled_service: string;
  code?: string;
  city?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export const findNearestAirport = async (latitude: number, longitude: number): Promise<Airport> => {
  try {
    
    // Get all airports from the backend using cache
    const allAirports = await fetchAllAirportsCached();
    
    
    // Filter for commercial airports only
    const commercialAirports = allAirports.filter((airport: RawAirportData) => {
      // Must have a valid IATA code (3 letters)
      const hasValidIATA = airport.iata_code && 
                          airport.iata_code.length === 3 && 
                          /^[A-Z]{3}$/.test(airport.iata_code);
      
      // Must be a commercial airport type
      const isCommercialType = airport.type === 'large_airport' || 
                              airport.type === 'medium_airport';
      
      // Or has scheduled service
      const hasScheduledService = airport.scheduled_service === 'yes';
      
      // Exclude heliports and seaplane bases
      const isNotHeliportOrSeaplane = airport.type !== 'heliport' && 
                                     airport.type !== 'seaplane_base';
      
      return hasValidIATA && isNotHeliportOrSeaplane && (isCommercialType || hasScheduledService);
    });
    
    
    if (commercialAirports.length === 0) {
      console.warn('No commercial airports found, falling back to JFK');
      return {
        code: 'JFK',
        name: 'John F. Kennedy International Airport',
        city: 'New York',
        country: 'United States',
        latitude: 40.6413,
        longitude: -73.7781,
        iata_code: 'JFK'
      };
    }
    
    // Find the nearest commercial airport
    let nearestAirport = commercialAirports[0];
    let shortestDistance = calculateDistance(
      latitude,
      longitude,
      parseFloat(commercialAirports[0].latitude_deg),
      parseFloat(commercialAirports[0].longitude_deg)
    );
    
    for (const airport of commercialAirports) {
      const airportLat = parseFloat(airport.latitude_deg);
      const airportLon = parseFloat(airport.longitude_deg);
      
      // Skip if coordinates are invalid
      if (isNaN(airportLat) || isNaN(airportLon)) continue;
      
      const distance = calculateDistance(
        latitude,
        longitude,
        airportLat,
        airportLon
      );
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestAirport = airport;
      }
    }
    
    
    
    // Convert to our Airport interface format
    const result: Airport = {
      code: nearestAirport.iata_code,
      name: nearestAirport.name,
      city: nearestAirport.municipality || 'Unknown',
      country: nearestAirport.iso_country || 'Unknown',
      latitude: parseFloat(nearestAirport.latitude_deg),
      longitude: parseFloat(nearestAirport.longitude_deg),
      iata_code: nearestAirport.iata_code
    };
    
    return result;
    
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    
    // Fallback to Cairo International Airport for Egypt region
    return {
      code: 'CAI',
      name: 'Cairo International Airport',
      city: 'Cairo',
      country: 'Egypt',
      latitude: 30.1219,
      longitude: 31.4056,
      iata_code: 'CAI'
    };
  }
};

// New function to find capital airport
export const findCapitalAirport = async (latitude: number, longitude: number): Promise<Airport> => {
  try {
    
    // Get capital airport code from coordinates
    const capitalAirportCode = await getCapitalAirportFromCoordinates(latitude, longitude);
    
    if (!capitalAirportCode) {
      return await findNearestAirport(latitude, longitude);
    }
    
    // Search for the capital airport in our database
    const response = await api.get('/airports');
    const allAirports = response.data.data;
    
    const capitalAirport = allAirports.find((airport: RawAirportData) => 
      airport.iata_code === capitalAirportCode
    );
    
    if (capitalAirport) {
      return {
        code: capitalAirport.iata_code || capitalAirport.code,
        name: capitalAirport.name,
        city: capitalAirport.municipality || 'Unknown',
        country: capitalAirport.iso_country || 'Unknown',
        latitude: parseFloat(capitalAirport.latitude_deg),
        longitude: parseFloat(capitalAirport.longitude_deg),
        iata_code: capitalAirport.iata_code
      };
    } else {
      return await findNearestAirport(latitude, longitude);
    }
  } catch (error) {
    console.error('Error finding capital airport:', error);
    // Fallback to nearest airport
    return await findNearestAirport(latitude, longitude);
  }
};

// Cache for airports per language
const _airportsCache: Record<string, Record<string, Airport>> = {};
let _allAirportsMemoryCache: RawAirportData[] | null = null;

const CACHE_KEY_PREFIX = 'tourtastic_airports_cache_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to fetch all airports with localStorage and memory caching
const fetchAllAirportsCached = async (): Promise<RawAirportData[]> => {
  if (_allAirportsMemoryCache && _allAirportsMemoryCache.length > 0) {
    return _allAirportsMemoryCache;
  }

  try {
    const cachedData = localStorage.getItem(`${CACHE_KEY_PREFIX}all`);
    const cachedTime = localStorage.getItem(`${CACHE_KEY_PREFIX}all_time`);

    if (cachedData && cachedTime && (Date.now() - Number(cachedTime) < CACHE_TTL_MS)) {
      const parsed = JSON.parse(cachedData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _allAirportsMemoryCache = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read airports from localStorage cache', e);
  }

  const response = await api.get('/airports');
  const allAirports: RawAirportData[] = response.data.data || [];

  if (allAirports.length > 0) {
    _allAirportsMemoryCache = allAirports;
    try {
      localStorage.setItem(`${CACHE_KEY_PREFIX}all`, JSON.stringify(allAirports));
      localStorage.setItem(`${CACHE_KEY_PREFIX}all_time`, String(Date.now()));
    } catch (e) {
      console.warn('Failed to save airports to localStorage', e);
    }
  }

  return allAirports;
};

// Fetch airports and return a map keyed by IATA code, localized by lang ('en'|'ar')
export const getAirportsMap = async (lang = 'en'): Promise<Record<string, Airport>> => {
  const key = lang || 'en';
  if (_airportsCache[key]) return _airportsCache[key];

  try {
    const cachedMap = localStorage.getItem(`${CACHE_KEY_PREFIX}map_${key}`);
    const cachedTime = localStorage.getItem(`${CACHE_KEY_PREFIX}map_${key}_time`);

    if (cachedMap && cachedTime && (Date.now() - Number(cachedTime) < CACHE_TTL_MS)) {
      const parsed = JSON.parse(cachedMap);
      if (Object.keys(parsed).length > 0) {
        _airportsCache[key] = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read airports map from localStorage cache', e);
  }

  try {
    const resp = await api.get(`/airports?lang=${key}`);
    const list: Airport[] = Array.isArray(resp.data?.data) ? resp.data.data : [];
    const map: Record<string, Airport> = {};
    list.forEach((a: Airport) => {
      const code = (a.iata_code as string) || (a.code as string) || (a.iata as string);
      if (code) map[code] = a;
    });
    _airportsCache[key] = map;
    try {
      localStorage.setItem(`${CACHE_KEY_PREFIX}map_${key}`, JSON.stringify(map));
      localStorage.setItem(`${CACHE_KEY_PREFIX}map_${key}_time`, String(Date.now()));
    } catch (e) {
      console.warn('Failed to save airports map to localStorage', e);
    }
    return map;
  } catch (err) {
    console.error('Failed to load airports map', err);
    return {};
  }
};