import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  Star,
  MapPin,
  Clock,
  Plane,
  Landmark,
  Utensils,
  ShoppingBag,
  Camera,
  Sunrise,
  Sun,
  Sunset,
  Moon
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import PlaneAnimation from '../components/ui/PlaneAnimation';
import api from '../config/api';
import { Destination } from '../services/destinationService';
import { Flight, FlightSearchParams, searchFlights, getSearchResults } from '../services/flightService';
import { Airport, findCapitalAirport } from '../services/airportService';
import FlightResults from '@/components/flights/FlightResults';

// Helper functions
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${remainingMinutes}m`;
  }
};

const getTimeOfDay = (dateString: string) => {
  const hour = new Date(dateString).getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

const getTimeOfDayIcon = (timeOfDay: string) => {
  switch (timeOfDay) {
    case 'morning': return <Sunrise className="w-4 h-4 text-orange-400" />;
    case 'afternoon': return <Sun className="w-4 h-4 text-yellow-400" />;
    case 'evening': return <Sunset className="w-4 h-4 text-orange-600" />;
    default: return <Moon className="w-4 h-4 text-blue-400" />;
  }
};

// Small helper to safely read iata/airport codes from unknown API shapes
const getIataCode = (point: unknown): string | undefined => {
  if (!point || typeof point !== 'object') return undefined;
  const p = point as Record<string, unknown>;
  const iata = typeof p['iata'] === 'string' ? (p['iata'] as string) : undefined;
  const airport = typeof p['airport'] === 'string' ? (p['airport'] as string) : undefined;
  return (iata || airport) && String(iata || airport).toUpperCase();
};

// Import getAirlineLogo from flightHelpers
import { getAirlineLogo } from '../components/flights/utils/flightHelpers';

const DestinationDetails: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const currentLang = i18n.language || 'en';
  const navigate = useNavigate();
  const { destinationId } = useParams<{ destinationId: string }>();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [loadingDestination, setLoadingDestination] = useState(true);
  const [errorDestination, setErrorDestination] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [sortBy, setSortBy] = useState('price');
  const [nearestAirport, setNearestAirport] = useState<Airport | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [manualOrigin, setManualOrigin] = useState('');
  const [visibleFlights, setVisibleFlights] = useState(10);
  const [results, setResults] = useState<{ complete: number; result: Flight[] } | null>(null);

  // Handler for flight selection
  const handleFlightSelection = (flight: Flight | null) => {
    if (flight === null) {
      setSelectedFlight(null);
      setShowDetails(null);
    } else {
      setSelectedFlight(flight);
      setShowDetails(showDetails === flight.trip_id ? null : flight.trip_id);
    }
  };

  // Handler for adding flight to cart
  const handleAddToCart = async (flight: Flight) => {
    // Validate required origin/destination
    if (!flight) return;
    const originCode = nearestAirport?.code || getIataCode(flight.legs[0].from);
    const destinationAirportCode = destination
      ? destination.quickInfo.airport
      : getIataCode(flight.legs[0].to);

    if (!originCode || String(originCode).length !== 3) {
      toast({ title: t('error', 'Error'), description: t('missingOrigin', 'Could not determine origin airport. Please enter manually.'), variant: 'destructive' });
      return;
    }

    if (!destinationAirportCode || String(destinationAirportCode).length !== 3) {
      toast({ title: t('error', 'Error'), description: t('missingDestination', 'Could not determine destination airport. Please try again later.'), variant: 'destructive' });
      return;
    }

    const passengers = {
      adults: flight.search_query?.adt || 1,
      children: flight.search_query?.chd || 0,
      infants: flight.search_query?.inf || 0
    };

    const singlePassengerTotal = (flight.price || 0) + (flight.tax || 0);
    const totalPassengers = (passengers.adults || 0) + (passengers.children || 0) + (passengers.infants || 0) || 1;
    const totalPrice = flight.total_price && flight.total_price > 0
      ? flight.total_price
      : (flight.price_breakdowns ? (
        (flight.price_breakdowns.ADT?.total || singlePassengerTotal) * (flight.search_query?.adt || 1) +
        (flight.price_breakdowns.CHD?.total || singlePassengerTotal * 0.75) * (flight.search_query?.chd || 0) +
        (flight.price_breakdowns.INF?.total || singlePassengerTotal * 0.1) * (flight.search_query?.inf || 0)
      ) : singlePassengerTotal * totalPassengers);

    // Helper to normalize airport value (may be string or object). Prefer IATA/code when available.
    const normalizeAirportValue = (val: unknown) => {
      if (!val && val !== 0) return '';
      if (typeof val === 'string') return val.toUpperCase();
      if (typeof val === 'object') {
        const v = val as Record<string, any>;
        const candidates = [v.code, v.iata, v.IATA, v.airport, v.en, v.ar];
        for (const c of candidates) {
          if (c && typeof c === 'string' && c.trim().length > 0) return c.toUpperCase();
        }
        return JSON.stringify(v);
      }
      return String(val).toUpperCase();
    };

    // Server expects flightDetails.from and flightDetails.to as simple strings (IATA or city)
    const originString = normalizeAirportValue(originCode);
    const destinationString = normalizeAirportValue(destinationAirportCode);

    const payload = {
      flightDetails: {
        // store simple strings for 'from' and 'to' to match FlightBooking schema
        from: originString,
        to: destinationString,
        departureDate: flight.legs[0].from.date,
        passengers,
        selectedFlight: {
          tripId: flight.trip_id,
          // ensure flightId is string
          flightId: String(flight.legs[0].segments[0].flightnumber || ''),
          airline: flight.legs[0].segments[0].airline_name,
          airlineCode: flight.legs[0].segments[0].iata,
          departureTime: flight.legs[0].from.date,
          arrivalTime: flight.legs[0].to.date,
          price: { total: totalPrice, currency: flight.currency },
          // server model expects `class` field
          class: flight.search_query?.options?.cabin || flight.legs[0]?.cabin_name || 'economy',
          segments: flight.legs[0].segments,
          price_breakdowns: flight.price_breakdowns || null,
          // Include fare_key for Seeru integration (use id as fare_key)
          fareKey: flight.id || flight.fare_key || null,
          // keep raw provider payload for debugging/record
          raw: flight
        }
      }
    };

    // Determine whether user is authenticated (token present)
    const token = localStorage.getItem('token');

    // Helper to persist locally (only used for anonymous users)
  const persistLocally = () => {
      try {
        const item = {
      // Save readable fields for localStorage
      from: nearestAirport?.city || String(originCode).toUpperCase(),
      to: destination?.name?.[currentLang] || String(destinationAirportCode).toUpperCase(),
      fromIata: String(originCode).toUpperCase(),
      toIata: String(destinationAirportCode).toUpperCase(),
      departureTime: payload.flightDetails.departureDate,
          passengers: payload.flightDetails.passengers,
          flightId: payload.flightDetails.selectedFlight.flightId,
          airline: payload.flightDetails.selectedFlight.airline,
          arrivalTime: payload.flightDetails.selectedFlight.arrivalTime,
          price: payload.flightDetails.selectedFlight.price.total,
          currency: payload.flightDetails.selectedFlight.price.currency,
          class: payload.flightDetails.selectedFlight.class,
          segments: payload.flightDetails.selectedFlight.segments
        };

        const existing = JSON.parse(localStorage.getItem('cartItems') || '[]');
        existing.push(item);
        localStorage.setItem('cartItems', JSON.stringify(existing));
        toast({ title: t('success', 'Success'), description: t('flightSavedLocally', 'Flight saved to your cart (local).'), variant: 'default' });
        navigate('/cart');
      } catch (err) {
        console.error('Failed to save cart item locally:', err);
        toast({ title: t('error', 'Error'), description: t('failedToAddToCart', 'Failed to add flight to cart'), variant: 'destructive' });
      }
    };

    // If user appears authenticated, ensure we attempt to save to DB and do NOT fall back to localStorage silently.
    if (token) {
      try {
        const response = await api.post('/cart', payload, { headers: { Authorization: `Bearer ${token}` } });
        if (response?.data?.success) {
          toast({ title: t('success', 'Success'), description: t('flightAddedToCart', 'Flight has been added to your cart'), variant: 'default' });
          navigate('/cart');
          return;
        }

        // Backend responded but indicated failure - show error to the user instead of silently saving locally
        console.warn('Add to cart response not successful for authenticated user', response?.data);
        toast({ title: t('error', 'Error'), description: response?.data?.message || t('failedToAddToCart', 'Failed to add flight to cart'), variant: 'destructive' });
        return;
      } catch (err) {
        console.error('API add to cart failed for authenticated user:', err);
        toast({ title: t('error', 'Error'), description: t('failedToAddToCart', 'Failed to add flight to cart'), variant: 'destructive' });
        return;
      }
    }

    // Anonymous user: try server (will use session) and fall back to localStorage if server call fails
    try {
      const response = await api.post('/cart', payload);
      if (response?.data?.success) {
        toast({ title: t('success', 'Success'), description: t('flightAddedToCart', 'Flight has been added to your cart'), variant: 'default' });
        navigate('/cart');
        return;
      }

      console.warn('Add to cart response not successful for anonymous user, falling back to localStorage', response?.data);
      persistLocally();
    } catch (err) {
      console.error('API add to cart failed for anonymous user, falling back to localStorage:', err);
      persistLocally();
    }
  };

  // Get user's location and find nearest airport
  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;

              // Use capital airport instead of nearest airport
              const airport = await findCapitalAirport(latitude, longitude);
              setNearestAirport(airport);
              setLocationError(null);
            } catch (error) {
              console.error('Error finding capital airport:', error);
              setLocationError('Failed to find capital airport. Please enable location services or enter manually.');
            }
          },
          (error) => {
            console.error('Geolocation error:', error);
            setLocationError('Unable to get your location. Please enable location services or enter your departure city manually.');
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
          }
        );
      } else {
        setLocationError('Geolocation is not supported by this browser. Please enter manually.');
      }
    };

    getUserLocation();
  }, []);

  const pollSearchResults = useCallback(async (searchId: string, maxAttempts = 15) => {
    setIsPolling(true);
    let attempts = 0;
    let lastComplete = 0;
    let stuckCounter = 0;
    let hasFoundResults = false;

    const poll = async () => {
      try {
        const pollResults = await getSearchResults(searchId);
        setResults(pollResults);

        // Update flights if we have results
        if (pollResults.result && Array.isArray(pollResults.result)) {
          if (pollResults.result.length > 0) {
            setFlights(pollResults.result);
            hasFoundResults = true;
          }
        }

        // Check completion status
        const isComplete = pollResults.complete >= 100;
        const isStuck = pollResults.complete === lastComplete;

        if (isStuck) {
          stuckCounter++;
        } else {
          stuckCounter = 0;
          lastComplete = pollResults.complete;
        }

        // Determine if we should continue polling
        const shouldStopPolling =
          isComplete ||
          (stuckCounter >= 3 && pollResults.complete > 50) || // Only stop if we've made significant progress
          attempts >= maxAttempts;

        if (shouldStopPolling) {
          setIsPolling(false);
          setIsLoading(false);
          
          // Only show no results message if we're completely done and found nothing
          if (!hasFoundResults && pollResults.complete >= 100 && (!pollResults.result || pollResults.result.length === 0)) {
            toast({
              title: t('noFlights', 'No Flights Found'),
              description: t('noFlightsAvailable', 'No flights are currently available for this destination. Please try different dates or check back later.'),
              variant: 'default',
            });
          }
          return;
        }

        // Continue polling
        attempts++;
        setTimeout(poll, 2000);
      } catch (error) {
        console.error('Poll error:', error);
        // Only show error if we haven't found any flights yet
        if (flights.length === 0) {
          setIsPolling(false);
          setIsLoading(false);
          toast({
            title: t('error', 'Error'),
            description: t('flightSearchError', 'Failed to fetch flight results. Please try again.'),
            variant: 'destructive',
          });
        } else {
          // If we already have flights, just stop polling silently
          setIsPolling(false);
          setIsLoading(false);
        }
      }
    };

    await poll();
    // Reset results when polling stops
    return () => {
      setResults(null);
    };
  }, [t, toast, flights.length]);

  // Fetch destination details
  useEffect(() => {
    const fetchDestinationDetails = async () => {
      if (!destinationId) return;
      setLoadingDestination(true);
      setErrorDestination(null);
      try {
        const response = await api.get(`/destinations/${destinationId}`);
        if (response.data.success) {
          // Normalize quickInfo.airport to string if backend returned an object
          const dest = response.data.data;
          try {
            if (dest && dest.quickInfo && dest.quickInfo.airport && typeof dest.quickInfo.airport !== 'string') {
              const ap = dest.quickInfo.airport;
              dest.quickInfo.airport = (ap && ap.code) ? String(ap.code) : String(ap);
            }
          } catch (nn) {
            // ignore normalization errors and keep original
          }
          setDestination(dest);
        } else {
          setErrorDestination('Destination not found.');
        }
      } catch (error) {
        console.error('Error fetching destination details:', error);
        setErrorDestination('Failed to load destination details.');
      } finally {
        setLoadingDestination(false);
      }
    };

    fetchDestinationDetails();
  }, [destinationId]);

  // Helper to join list fields that may arrive as:
  // - Array of strings
  // - Array of localized objects { en: string, ar: string }
  // - Localized object of arrays { en: string[], ar: string[] }
  const joinLocalizedList = (value: any): string => {
    if (!value) return '';
    // If already an array, map each item to a display string
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (!item && item !== 0) return '';
          if (typeof item === 'string') return item;
          if (typeof item === 'object') {
            const v = item as Record<string, any>;
            return v[currentLang] || v.en || v.ar || '';
          }
          return String(item);
        })
        .filter(Boolean)
        .join(', ');
    }
    // If localized object containing arrays per lang
    if (typeof value === 'object') {
      const perLang = (value[currentLang] || value.en || value.ar) as any[] | undefined;
      if (Array.isArray(perLang)) {
        return perLang
          .map((item) => {
            if (!item && item !== 0) return '';
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
              const v = item as Record<string, any>;
              return v[currentLang] || v.en || v.ar || '';
            }
            return String(item);
          })
          .filter(Boolean)
          .join(', ');
      }
    }
    // Fallback to string
    return String(value);
  };

  const searchFlightsForDestination = useCallback(async () => {
    if (!destinationId || !nearestAirport || !destination) return;

  // Validate airport codes (airport stored as single string)
  const destinationAirportCode = destination.quickInfo.airport;

    if (!nearestAirport.code || nearestAirport.code.length !== 3 || !destinationAirportCode || destinationAirportCode.length !== 3) {
      console.error('Invalid airport codes:', { origin: nearestAirport.code, destination: destinationAirportCode });
      toast({
        title: t('error', 'Error'),
        description: t('invalidAirportCodes', 'Invalid airport codes. Please try again later.'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const currentDate = new Date();
      const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const formattedStartDate = currentDate.toISOString().split('T')[0];
      const formattedEndDate = lastDayOfMonth.toISOString().split('T')[0];


  // Calculate date based on destination.searchWindowDays (fallback to 30)
  const searchWindowDays = (destination as any)?.searchWindowDays ?? 30;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + Number(searchWindowDays));
  const searchDate = format(futureDate, 'yyyy-MM-dd');


      const searchParams: FlightSearchParams = {
        flightSegments: [
          {
            from: nearestAirport.code,
            to: destination.quickInfo.airport,
            date: searchDate
          }
        ],
        passengers: {
          adults: 1,
          children: 0,
          infants: 0
        },
        cabin: 'e',
        direct: false // Allow connections for better results
      };

      const searchResponse = await searchFlights(searchParams);

      if (searchResponse.search_id) {
        await pollSearchResults(searchResponse.search_id);
      } else {
        setIsLoading(false);
        toast({
          title: t('error', 'Error'),
          description: t('flightSearchError', 'Failed to initiate flight search. Please try again.'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error searching flights:', error);
      setIsLoading(false);
      toast({
        title: t('error', 'Error'),
        description: t('flightSearchError', 'Failed to search for flights. Please try again.'),
        variant: 'destructive',
      });
    }
  }, [destinationId, nearestAirport, destination, toast, pollSearchResults, t]);

  // Search for flights when airport and destination are available
  useEffect(() => {
    if (nearestAirport && destination && !isLoading && flights.length === 0) {
      searchFlightsForDestination();
    }
  }, [nearestAirport, destination, searchFlightsForDestination, isLoading, flights.length]);

  // Handle loading more flights
  const handleLoadMore = () => {
    setVisibleFlights(prev => prev + 10);
  };

  // Filter and sort flights
  const filteredAndSortedFlights = flights
    .sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return (a.price || 0) - (b.price || 0);
        case 'duration':
          return (a.total_duration || 0) - (b.total_duration || 0);
        case 'departure':
          return new Date(a.legs[0]?.from?.date || 0).getTime() - new Date(b.legs[0]?.from?.date || 0).getTime();
        default:
          return 0;
      }
    })
    .slice(0, visibleFlights);

  if (loadingDestination) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PlaneAnimation size="lg" />
      </div>
    );
  }

  if (errorDestination || !destination) {
    return (
      <section className="py-16 text-center">
        <p className="text-lg text-red-500">{errorDestination || 'Destination not found'}</p>
      </section>
    );
  }

  return (
    <div>
      {locationError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">{locationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative h-[400px] bg-cover bg-center" style={{ backgroundImage: `url(${destination.image})` }}>
        <div className="absolute inset-0 bg-black bg-opacity-50" />
        <div className="relative container mx-auto px-4 h-full flex flex-col justify-end pb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>{destination.name[currentLang]}</h1>
          <div className="flex items-center gap-4 text-white" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="flex items-center">
              <Star className="w-5 h-5 text-yellow-400 mr-1" fill="currentColor" />
              <span>{destination.rating.toFixed(1)}</span>
            </div>
            <span>•</span>
            <span>{destination.country[currentLang]}</span>
          </div>
        </div>
      </section>

      {/* Description Section */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Main Description */}
              <div className="md:col-span-2">
                <h2 className="text-3xl font-bold mb-6" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                  {t('discover', currentLang === 'ar' ? 'اكتشف' : 'Discover')} {destination.name[currentLang]}
                </h2>
                <p className="text-gray-600 leading-relaxed text-lg mb-6" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                  {destination.description[currentLang]}
                </p>

                {/* Key Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                  <div className="flex items-start gap-3">
                    <Landmark className="w-5 h-5 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-semibold mb-1" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('topAttractions', currentLang === 'ar' ? 'أهم المعالم' : 'Top Attractions')}
                      </h3>
                      <p className="text-gray-600 text-sm" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {joinLocalizedList(destination?.topAttractions) ||
                          t('noAttractions', currentLang === 'ar' ? 'لا توجد معالم مدرجة' : 'No attractions listed')}
                      </p>
                    </div>
                  </div>                  <div className="flex items-start gap-3">
                    <Utensils className="w-5 h-5 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-semibold mb-1" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('localCuisine', currentLang === 'ar' ? 'المأكولات المحلية' : 'Local Cuisine')}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {joinLocalizedList(destination?.localCuisine) || t('noCuisine', 'No cuisine information available')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <ShoppingBag className="w-5 h-5 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-semibold mb-1" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('shopping', currentLang === 'ar' ? 'التسوق' : 'Shopping')}
                      </h3>
                      <p className="text-gray-600 text-sm" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {joinLocalizedList(destination?.shopping) ||
                          t('noShopping', currentLang === 'ar' ? 'لا توجد معلومات تسوق متاحة' : 'No shopping information available')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Camera className="w-5 h-5 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-semibold mb-1" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('bestTimeToVisit', currentLang === 'ar' ? 'أفضل وقت للزيارة' : 'Best Time to Visit')}
                      </h3>
                      <p className="text-gray-600 text-sm" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {destination.bestTimeToVisit[currentLang]}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Info Sidebar */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                  {t('quickInfo', currentLang === 'ar' ? 'معلومات سريعة' : 'Quick Info')}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-primary-500" />
                    <div>
                      <p className="text-sm text-gray-500" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('airport', currentLang === 'ar' ? 'المطار' : 'Airport')}
                      </p>
                      <p className="font-medium" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {destination.quickInfo.airport}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-primary-500" />
                    <div>
                      <p className="text-sm text-gray-500" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('timeZone', currentLang === 'ar' ? 'المنطقة الزمنية' : 'Time Zone')}
                      </p>
                      <p className="font-medium" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {typeof destination.quickInfo.timeZone === 'string'
                          ? destination.quickInfo.timeZone
                          : destination.quickInfo.timeZone[currentLang]}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-primary-500" />
                    <div>
                      <p className="text-sm text-gray-500" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                        {t('rating', currentLang === 'ar' ? 'التقييم' : 'Rating')}
                      </p>
                      <p className="font-medium" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>{destination.rating.toFixed(1)}/5.0</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Flights Section */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
              {t('availableFlights', currentLang === 'ar' ? 'الرحلات المتاحة' : 'Available Flights')}
              {nearestAirport && (currentLang === 'ar' ? ` من ${nearestAirport.city}` : ` from ${nearestAirport.city}`)}
            </h2>

            {/* Filters Section */}
            <div className="flex flex-wrap gap-4 items-center justify-between mb-8 p-4 bg-white rounded-lg shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                    {t('sortBy', currentLang === 'ar' ? 'ترتيب حسب' : 'Sort by')}:
                  </label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price">{t('price', currentLang === 'ar' ? 'السعر' : 'Price')}</SelectItem>
                      <SelectItem value="duration">{t('duration', currentLang === 'ar' ? 'المدة' : 'Duration')}</SelectItem>
                      <SelectItem value="departure">{t('departure', currentLang === 'ar' ? 'المغادرة' : 'Departure')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="text-sm text-gray-600" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                {t('showingFlights', currentLang === 'ar' 
                  ? `عرض ${Math.min(visibleFlights, filteredAndSortedFlights.length)} من ${flights.length} رحلة`
                  : `Showing ${Math.min(visibleFlights, filteredAndSortedFlights.length)} of ${flights.length} flights`)}
              </div>
            </div>

            {/* Loading State */}
            {(isLoading || isPolling) && (
              <div className="text-center py-12">
                <PlaneAnimation size="lg" progress={isPolling ? results?.complete || 0 : undefined} />
                <p className="text-lg text-gray-600 mt-4">
                  {isPolling 
                    ? t('searchingFlightsProgress', 'Searching for flights... {{progress}}% complete', { progress: Math.round(results?.complete || 0) })
                    : t('loading', 'Loading...')}
                </p>
              </div>
            )}

            {/* Flight Results */}
            {!isLoading && !isPolling && filteredAndSortedFlights.length > 0 && (
              <>
                <FlightResults
                  flights={filteredAndSortedFlights}
                  selectedFlight={selectedFlight}
                  showDetails={showDetails}
                  onFlightSelection={handleFlightSelection}
                  onAddToCart={handleAddToCart}
                />
                {filteredAndSortedFlights.length < flights.length && (
                  <div className="text-center mt-6">
                    <Button
                      onClick={handleLoadMore}
                      variant="outline"
                      className="px-6"
                    >
                      {t('loadMore', currentLang === 'ar' ? 'تحميل المزيد' : 'Load More')}
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* No Flights Message */}
            {!isLoading && !isPolling && filteredAndSortedFlights.length === 0 && flights.length === 0 && (
              <div className="text-center py-12">
                <Plane className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">{t('noFlights', 'No Flights Found')}</h3>
                <p className="text-gray-500">{t('noFlightsMessage', 'No flights are currently available for this destination.')}</p>
                <Button
                  onClick={() => searchFlightsForDestination()}
                  className="mt-4"
                >
                  {t('searchAgain', 'Search Again')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DestinationDetails;
