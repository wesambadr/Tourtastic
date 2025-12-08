import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { CalendarIcon, Plane, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Flight, PassengerCount } from '@/services/flightService';
import { Airport } from '@/services/airportService';
import { toast } from '@/hooks/use-toast';
import api from '@/config/api';
import { MultiCityFlightResults } from '@/components/flights/MultiCityFlightResults';
import { useMultiCitySearch, SegmentInput } from '@/hooks/useMultiCitySearch';

// Form schema
const searchFormSchema = z.object({
  searchType: z.enum(['oneWay', 'roundTrip', 'multiCity']).optional(),
  flightSegments: z.array(z.object({
    from: z.string().min(2, { message: 'الرجاء إدخال مدينة المغادرة' }),
    to: z.string().min(2, { message: 'الرجاء إدخال مدينة الوصول' }),
    date: z.date({ required_error: 'الرجاء اختيار تاريخ السفر' }),
  })),
  returnDate: z.date().optional(),
  passengers: z.object({
    adults: z.number().min(1, { message: 'يجب اختيار مسافر بالغ واحد على الأقل' }),
    children: z.number().min(0),
    infants: z.number().min(0),
  }),
  cabin: z.enum(['e', 'p', 'b', 'f']).optional(),
  direct: z.boolean().optional(),
});

type SearchFormValues = z.infer<typeof searchFormSchema>;

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

interface FilterState {
  sortBy: 'price_asc' | 'price_desc' | 'duration_asc' | 'departure_asc' | 'arrival_asc';
  selectedAirlines: string[];
  timeOfDay: {
    departure: TimeOfDay[];
    arrival: TimeOfDay[];
  };
  priceRange: {
    min: number;
    max: number;
  };
}

interface FilterSidebarProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  availableAirlines: string[];
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  setFilters,
  availableAirlines,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'ar';

  return (
    <Card className="sticky top-4 p-4">
      <CardContent className="space-y-6" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Sort By Filter */}
        <div>
          <h3 className="font-semibold mb-3 text-right">
            {t('sortBy', currentLang === 'ar' ? 'ترتيب حسب' : 'Sort By')}
          </h3>
          <RadioGroup
            dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
            value={filters.sortBy}
            onValueChange={(value: FilterState['sortBy']) =>
              setFilters(prev => ({ ...prev, sortBy: value }))
            }
            className="space-y-2 text-right"
          >
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="price_asc" className="text-right flex-grow">
                {t('sortPriceAsc', currentLang === 'ar' ? 'السعر: من الأقل إلى الأعلى' : 'Price: Low to High')}
              </Label>
              <RadioGroupItem value="price_asc" id="price_asc" className="rtl:mr-auto" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="price_desc" className="text-right flex-grow">
                {t('sortPriceDesc', currentLang === 'ar' ? 'السعر: من الأعلى إلى الأقل' : 'Price: High to Low')}
              </Label>
              <RadioGroupItem value="price_desc" id="price_desc" className="rtl:mr-auto" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="duration_asc" className="text-right flex-grow">
                {t('sortDurationAsc', currentLang === 'ar' ? 'المدة: الأقصر أولاً' : 'Duration: Shortest First')}
              </Label>
              <RadioGroupItem value="duration_asc" id="duration_asc" className="rtl:mr-auto" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="departure_asc" className="text-right flex-grow">
                {t('sortDepartureAsc', currentLang === 'ar' ? 'وقت المغادرة: الأبكر أولاً' : 'Departure: Earliest First')}
              </Label>
              <RadioGroupItem value="departure_asc" id="departure_asc" className="rtl:mr-auto" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="arrival_asc" className="text-right flex-grow">
                {t('sortArrivalAsc', currentLang === 'ar' ? 'وقت الوصول: الأبكر أولاً' : 'Arrival: Earliest First')}
              </Label>
              <RadioGroupItem value="arrival_asc" id="arrival_asc" className="rtl:mr-auto" />
            </div>
          </RadioGroup>
        </div>

        {/* Airlines Filter */}
        <div>
          <h3 className="font-semibold mb-3 text-right">{t('airlinesHeading', 'شركات الطيران')}</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
            {availableAirlines.map((airline) => (
              <div key={airline} className="flex items-center justify-end gap-2">
                <Label
                  htmlFor={`airline-${airline}`}
                  className="text-right flex-grow"
                >
                  {t(`airlines.${airline}`, airline)}
                </Label>
                <Checkbox
                  id={`airline-${airline}`}
                  checked={filters.selectedAirlines.includes(airline)}
                  className="rtl:mr-auto"
                  onCheckedChange={(checked) => {
                    setFilters(prev => ({
                      ...prev,
                      selectedAirlines: checked
                        ? [...prev.selectedAirlines, airline]
                        : prev.selectedAirlines.filter(a => a !== airline)
                    }))
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Departure Time Filter */}
        <div>
          <h3 className="font-semibold mb-3 text-right">{t('departureTime', 'وقت المغادرة')}</h3>
          <div className="space-y-2" dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
            {(['morning', 'afternoon', 'evening', 'night'] as const).map((time) => (
              <div key={time} className="flex items-center justify-end gap-2">
                <Label htmlFor={`departure_${time}`} className="flex items-center gap-2">
                  <span>
                    {currentLang === 'ar' ? {
                      'morning': 'صباحاً',
                      'afternoon': 'ظهراً',
                      'evening': 'مساءً',
                      'night': 'ليلاً'
                    }[time] : time}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {time === 'morning' && '(5AM - 11:59AM)'}
                    {time === 'afternoon' && '(12PM - 4:59PM)'}
                    {time === 'evening' && '(5PM - 8:59PM)'}
                    {time === 'night' && '(9PM - 4:59AM)'}
                  </span>
                </Label>
                <Checkbox
                  id={`departure_${time}`}
                  checked={filters.timeOfDay.departure.includes(time)}
                  onCheckedChange={(checked) => {
                    setFilters(prev => ({
                      ...prev,
                      timeOfDay: {
                        ...prev.timeOfDay,
                        departure: checked
                          ? [...prev.timeOfDay.departure, time]
                          : prev.timeOfDay.departure.filter(t => t !== time)
                      }
                    }));
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Price Range Filter */}
        <div>
          <h3 className="font-semibold mb-3">{t('priceRange', 'نطاق السعر')}</h3>
          <div className="space-y-4">
            <Slider
              value={[filters.priceRange.min, filters.priceRange.max]}
              min={0}
              max={10000}
              step={100}
              onValueChange={([min, max]) => {
                setFilters(prev => ({
                  ...prev,
                  priceRange: { min, max }
                }));
              }}
            />
            <div className="flex justify-between text-sm">
              <span>{filters.priceRange.min}</span>
              <span>{filters.priceRange.max}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Flights = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedFlights, setSelectedFlights] = useState<Record<number, Flight>>({});
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [availableAirlines, setAvailableAirlines] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    sortBy: 'price_asc',
    selectedAirlines: [],
    timeOfDay: {
      departure: [],
      arrival: []
    },
    priceRange: {
      min: 0,
      max: 10000
    }
  });
  const [fromAirportNames, setFromAirportNames] = useState<string[]>(['']);
  const [toAirportNames, setToAirportNames] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState<Airport[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Airport[]>([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState<number | null>(null);
  const [showToSuggestions, setShowToSuggestions] = useState<number | null>(null);
  const [returnDatePickerOpen, setReturnDatePickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState<boolean[]>([false]);
  const initializedFromStateRef = useRef(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch, trigger, setError, clearErrors } = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      searchType: 'oneWay',
      flightSegments: [{ from: '', to: '', date: undefined }],
      passengers: {
        adults: 1,
        children: 0,
        infants: 0,
      },
      cabin: 'e',
      direct: false,
      returnDate: undefined,
    },
  });

  const flightSegments = watch('flightSegments');
  const passengers = watch('passengers');
  const cabin = watch('cabin');
  const direct = watch('direct');
  const returnDate = watch('returnDate');

  const { searchSections, startMultiSearch, loadMore } = useMultiCitySearch();
  // Keep track of the last submitted search so we can retry automatically if needed
  const lastSearchPayloadRef = useRef<{
    segments: SegmentInput[];
    passengers: PassengerCount;
    cabin?: 'e' | 'p' | 'b' | 'f';
    direct?: boolean;
  } | null>(null);
  const hasRetriedRef = useRef(false);

  // Keep a ref to the latest searchSections so polling helpers can read it
  const searchSectionsRef = useRef(searchSections);
  useEffect(() => {
    searchSectionsRef.current = searchSections;
  }, [searchSections]);

  // Wait for search results to arrive (polls searchSectionsRef). Resolves true if results found, false on timeout.
  const waitForResults = (timeoutMs = 60000, pollInterval = 500) => {
    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const check = () => {
        const sections = searchSectionsRef.current;
        if (sections && sections.length > 0) {
          // Check if we have any flights - this is the primary success condition
          const hasFlights = sections.some(section => section.flights.length > 0);
          if (hasFlights) {
            resolve(true);
            return;
          }

          // Only consider it a failure if ALL sections are complete AND have no flights
          // Don't check for error message - error messages may persist even when results exist
          const allCompletedWithoutFlights = sections.every(section => section.isComplete && section.flights.length === 0);
          if (allCompletedWithoutFlights) {
            resolve(false);
            return;
          }
        }

        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }

        // schedule next check
        setTimeout(check, pollInterval);
      };
      check();
    });
  };

  // Update datePickerOpen state when flightSegments change
  useEffect(() => {
    setDatePickerOpen(Array(flightSegments.length).fill(false));
  }, [flightSegments.length]);

  // Update available airlines whenever search results change
  useEffect(() => {
    if (searchSections.length > 0) {
      const uniqueAirlines = new Set<string>();
      searchSections.forEach(section => {
        section.flights.forEach(flight => {
          if (flight.legs?.[0]?.segments?.[0]?.airline_name) {
            uniqueAirlines.add(flight.legs[0].segments[0].airline_name);
          }
        });
      });

      // Update available airlines for filtering
      const sortedAirlines = Array.from(uniqueAirlines).sort();
      setAvailableAirlines(sortedAirlines);
    }
  }, [searchSections]);

  const onSubmit = useCallback(async (data: SearchFormValues) => {
    try {
      setIsSubmitting(true);
      clearErrors();

      let segments = data.flightSegments;

      // For round trip, validate and add return segment
      if (data.searchType === 'roundTrip') {
        const outboundDate = data.flightSegments?.[0]?.date;
        if (!data.returnDate) {
          setError('returnDate', { type: 'manual', message: t('returnDateRequired', 'Return date is required for round trip flights') });
          setIsSubmitting(false);
          return;
        }
        if (outboundDate && data.returnDate <= outboundDate) {
          setError('returnDate', { type: 'manual', message: t('returnDateAfterDeparture', 'Return date must be after departure date') });
          setIsSubmitting(false);
          return;
        }

        if (data.returnDate && segments.length === 1) {
          segments = [
            segments[0],
            {
              from: segments[0].to,
              to: segments[0].from,
              date: data.returnDate,
            }
          ];
        }
      }

      const segmentsForHook = segments.map((segment, idx) => ({
        from: segment.from,
        to: segment.to,
        date: segment.date,
        fromDisplay: fromAirportNames[idx] || segment.from,
        toDisplay: toAirportNames[idx] || segment.to,
      }));

      // Save payload for potential retry
      lastSearchPayloadRef.current = {
        segments: segmentsForHook,
        passengers: {
          adults: data.passengers.adults ?? 1,
          children: data.passengers.children ?? 0,
          infants: data.passengers.infants ?? 0,
        },
        cabin: data.cabin,
        direct: data.direct,
      };
      hasRetriedRef.current = false;

      await startMultiSearch(segmentsForHook, {
        adults: data.passengers.adults ?? 1,
        children: data.passengers.children ?? 0,
        infants: data.passengers.infants ?? 0,
      }, data.cabin, data.direct);

      // Wait for the hook to populate results (avoid race where startMultiSearch returns a job id)
      const gotResults = await waitForResults(60000);
      if (gotResults) {
        setHasSearched(true);
      } else {
        // Initial search completed without usable results - retry immediately once (silently, without showing error)
        if (!hasRetriedRef.current && lastSearchPayloadRef.current) {
          hasRetriedRef.current = true;
          const payload = lastSearchPayloadRef.current;
          setIsSubmitting(true);
          try {
            await startMultiSearch(payload.segments, payload.passengers, payload.cabin, payload.direct);
            const retryResults = await waitForResults(30000, 500);
            if (retryResults) {
              setHasSearched(true);
            } else {
              // Only show error if retry also failed
              toast({
                title: t('searchErrorTitle', 'Search Error'),
                description: t('noFlightsFoundTimeout', 'No flights found after multiple attempts. Please try different search criteria.'),
                variant: 'destructive',
              });
            }
          } finally {
            setIsSubmitting(false);
          }
        } else {
          // If we can't retry, show error immediately
          toast({
            title: t('searchErrorTitle', 'Search Error'),
            description: t('noFlightsFoundTimeout', 'No flights found after multiple attempts. Please try different search criteria.'),
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      toast({
        title: t('error', 'Error'),
        description: t('flightSearchError', 'Failed to search for flights. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [fromAirportNames, toAirportNames, startMultiSearch, t]);

  // Define type for segments from home page state
  interface LocationStateSegment {
    from: string;
    to: string;
    date: string | Date;
    fromDisplayValue?: string;
    toDisplayValue?: string;
  }

  // Handle search params from home page (initialize once)
  useEffect(() => {
    if (initializedFromStateRef.current) return;
    if (!location.state) return;

    const { flightSegments: segments, passengers: passengerCounts } = location.state as {
      flightSegments?: Array<LocationStateSegment>;
      passengers?: PassengerCount;
      cabin?: 'e' | 'p' | 'b' | 'f';
      direct?: boolean;
    };

    if (segments && segments.length > 0) {
      const fromNames = segments.map(seg => seg.fromDisplayValue || seg.from);
      const toNames = segments.map(seg => seg.toDisplayValue || seg.to);
      setFromAirportNames(fromNames);
      setToAirportNames(toNames);

      setValue('flightSegments', segments.map((segment: LocationStateSegment) => ({
        from: segment.from,
        to: segment.to,
        date: new Date(segment.date),
      })));
    }

    if (passengerCounts) {
      setValue('passengers', passengerCounts);
    }

    // Auto submit once when fully provided. Build display-aware segments directly from
    // the navigation payload and call startMultiSearch to avoid relying on async state updates
    // (fromAirportNames/toAirportNames) which can be stale and produce wrong headers.
    if (segments && segments.length > 0 && segments.every((segment: LocationStateSegment) => segment.from && segment.to && segment.date)) {
      const segmentsForHook = segments.map((segment: LocationStateSegment) => ({
        from: segment.from,
        to: segment.to,
        date: new Date(segment.date),
        fromDisplay: segment.fromDisplayValue || segment.from,
        toDisplay: segment.toDisplayValue || segment.to,
      }));

      (async () => {
        try {
          setIsSubmitting(true);
          // Save payload for potential retry
          lastSearchPayloadRef.current = {
            segments: segmentsForHook,
            passengers: passengerCounts || { adults: 1, children: 0, infants: 0 },
            cabin: undefined,
            direct: undefined,
          };
          hasRetriedRef.current = false;

          await startMultiSearch(segmentsForHook, passengerCounts || { adults: 1, children: 0, infants: 0 }, undefined, undefined);

          const gotResults = await waitForResults(60000);
          if (gotResults) {
            setHasSearched(true);
          } else {
            // Initial search completed without usable results - retry immediately once
            toast({
              title: t('searchErrorTitle', 'Search Error'),
              description: t('noFlightsFoundTimeout', 'No flights found after multiple attempts. Please try different search criteria.'),
              variant: 'destructive',
            });
            if (!hasRetriedRef.current && lastSearchPayloadRef.current) {
              hasRetriedRef.current = true;
              const payload = lastSearchPayloadRef.current;
              setIsSubmitting(true);
              try {
                await startMultiSearch(payload.segments, payload.passengers, payload.cabin, payload.direct);
                const retryResults = await waitForResults(30000, 500);
                if (retryResults) {
                  setHasSearched(true);
                }
              } finally {
                setIsSubmitting(false);
              }
            }
          }
        } catch (error) {
          toast({
            title: t('error', 'Error'),
            description: t('flightSearchError', 'Failed to search for flights. Please try again.'),
            variant: 'destructive',
          });
        } finally {
          setIsSubmitting(false);
        }
      })();
    }

    initializedFromStateRef.current = true;
  }, [location.state, onSubmit, setValue, startMultiSearch, t]);

  // If we have searched and all sections are complete with zero results, trigger a one-time immediate retry
  useEffect(() => {
    if (!hasSearched) return;
    if (!searchSections || searchSections.length === 0) return;

    const allComplete = searchSections.every(s => s.isComplete);
    const totalFlights = searchSections.reduce((acc, s) => acc + (s.flights?.length || 0), 0);

    if (allComplete && totalFlights === 0 && !hasRetriedRef.current && lastSearchPayloadRef.current) {
      const payload = lastSearchPayloadRef.current;
      hasRetriedRef.current = true;
      void (async () => {
        setIsSubmitting(true);
        try {
          await startMultiSearch(payload.segments, payload.passengers, payload.cabin, payload.direct);
          const retryResults = await waitForResults(30000, 500);
          if (retryResults) {
            setHasSearched(true);
          }
        } finally {
          setIsSubmitting(false);
        }
      })();
    }
  }, [hasSearched, searchSections, startMultiSearch, t, waitForResults]);

  // Track which segments have been retried to avoid infinite loops
  const retriedSegmentsRef = useRef<Set<number>>(new Set());

  // Auto-retry individual segments that complete with zero flights
  useEffect(() => {
    if (!hasSearched || !searchSections || searchSections.length === 0) return;
    if (!lastSearchPayloadRef.current) return;

    const payload = lastSearchPayloadRef.current;

    searchSections.forEach((section, sectionIndex) => {
      // Check if this section is complete but has zero flights and hasn't been retried
      if (section.isComplete && section.flights.length === 0 && !retriedSegmentsRef.current.has(sectionIndex)) {
        // Mark this segment as retried to avoid infinite loops
        retriedSegmentsRef.current.add(sectionIndex);

        // Retry this specific segment
        void (async () => {
          try {
            const segment = payload.segments[sectionIndex];
            if (segment) {
              // Create a new search for just this segment
              await startMultiSearch([segment], payload.passengers, payload.cabin, payload.direct);
            }
          } catch (error) {
            console.error(`Failed to retry segment ${sectionIndex}:`, error);
          }
        })();
      }
    });
  }, [hasSearched, searchSections, startMultiSearch]);

  // Open filters popover automatically on desktop/laptop when results are shown
  useEffect(() => {
    if (!hasSearched) {
      setFiltersOpen(false);
      return;
    }

    const currentIsDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    setIsDesktop(currentIsDesktop);
    setFiltersOpen(currentIsDesktop);

    const onResize = () => {
      const desktopNow = window.innerWidth >= 768;
      setIsDesktop(desktopNow);
      if (hasSearched) setFiltersOpen(desktopNow);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [hasSearched]);
  const handleFlightSelection = useCallback((flight: Flight | null, searchIndex: number) => {
    if (flight === null) {
      setSelectedFlights(prev => {
        const newFlights = { ...prev };
        delete newFlights[searchIndex];
        return newFlights;
      });
      setShowDetails(null);
    } else {
      setSelectedFlights(prev => ({ ...prev, [searchIndex]: flight }));
      setShowDetails(showDetails === flight.trip_id ? null : flight.trip_id);
    }
  }, [showDetails]);

  const handleFromInputChange = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = e.target.value;
    setFromAirportNames(values => {
      const newValues = [...values];
      newValues[index] = value;
      return newValues;
    });
    setValue(`flightSegments.${index}.from`, value);

    if (value.length >= 2) {
      setShowFromSuggestions(index);
      try {
        const response = await api.get(`/airports/search?q=${encodeURIComponent(value)}&lang=${i18n.language}`);
        if (response.data.success && response.data.data) {
          const airports = response.data.data;
          // Filter out any airports without proper translation data
          const validAirports = airports.filter(airport =>
            i18n.language === 'ar' ?
              airport.name_arbic && airport.municipality_arbic && airport.country_arbic :
              airport.name && airport.municipality && airport.country
          );
          setFromSuggestions(validAirports);
        }
      } catch {
        setFromSuggestions([]);
      }
    } else {
      setShowFromSuggestions(null);
      setFromSuggestions([]);
    }
  };

  const handleToInputChange = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = e.target.value;
    setToAirportNames(values => {
      const newValues = [...values];
      newValues[index] = value;
      return newValues;
    });
    setValue(`flightSegments.${index}.to`, value);

    if (value.length >= 2) {
      setShowToSuggestions(index);
      try {
        const response = await api.get(`/airports/search?q=${encodeURIComponent(value)}&lang=${i18n.language}`);
        if (response.data.success && response.data.data) {
          const airports = response.data.data;
          // Filter out any airports without proper translation data
          const validAirports = airports.filter(airport =>
            i18n.language === 'ar' ?
              airport.name_arbic && airport.municipality_arbic && airport.country_arbic :
              airport.name && airport.municipality && airport.country
          );
          setToSuggestions(validAirports);
        }
      } catch {
        setToSuggestions([]);
      }
    } else {
      setShowToSuggestions(null);
      setToSuggestions([]);
    }
  };

  const handleFromSuggestionClick = (airport: Airport, index: number) => {
    setValue(`flightSegments.${index}.from`, airport.iata_code, { shouldValidate: true, shouldDirty: true });
    setFromAirportNames(values => {
      const newValues = [...values];
      if (i18n.language === 'ar' && airport.name_arbic) {
        newValues[index] = `${airport.iata_code} - ${airport.name_arbic} (${airport.municipality_arbic || airport.municipality || airport.city}، ${airport.country_arbic || airport.country})`;
      } else {
        newValues[index] = `${airport.iata_code} - ${airport.name} (${airport.municipality || airport.city}, ${airport.country || airport.iso_country})`;
      }
      return newValues;
    });
    setShowFromSuggestions(null);
  };

  const handleToSuggestionClick = (airport: Airport, index: number) => {
    setValue(`flightSegments.${index}.to`, airport.iata_code, { shouldValidate: true, shouldDirty: true });
    setToAirportNames(values => {
      const newValues = [...values];
      if (i18n.language === 'ar' && airport.name_arbic) {
        newValues[index] = `${airport.iata_code} - ${airport.name_arbic} (${airport.municipality_arbic || airport.municipality || airport.city}، ${airport.country_arbic || airport.country})`;
      } else {
        newValues[index] = `${airport.iata_code} - ${airport.name} (${airport.municipality || airport.city}, ${airport.country || airport.iso_country})`;
      }
      return newValues;
    });
    setShowToSuggestions(null);
  };

  const handleAddToCart = useCallback(async (flight: Flight) => {
    try {
      // Store flight in local cart if user is not logged in
      if (!localStorage.getItem('token')) {
        const cartItems = JSON.parse(localStorage.getItem('cartItems') || '[]');
        const newItem = {
          from: flight.legs[0].from.city,
          to: flight.legs[0].to.city,
          fromIata: flight.legs[0].from.iata || flight.legs[0].from.iata_code || flight.legs[0].from.airport || null,
          toIata: flight.legs[0].to.iata || flight.legs[0].to.iata_code || flight.legs[0].to.airport || null,
          flightId: flight.legs[0].segments[0].flightnumber,
          airline: flight.legs[0].segments[0].airline_name,
          airlineCode: flight.legs[0].segments[0].airline_code || flight.legs[0].segments[0].airline_iata || null,
          airlineLogo: flight.airline_logo_url || null,
          departureTime: flight.legs[0].from.date,
          arrivalTime: flight.legs[0].to.date,
          price: flight.price,
          currency: flight.currency,
          passengers: {
            adults: flight.search_query.adt || 1,
            children: flight.search_query.chd || 0,
            infants: flight.search_query.inf || 0
          },
          class: flight.search_query.options.cabin || 'economy'
          ,
          // store the full flight object so we can persist all details shown on the flight page
          selectedFlight: {
            ...flight,
            // normalize price into expected object shape used by backend
            price: {
              total: flight.price,
              currency: flight.currency
            },
            // Include fare_key for Seeru integration (use id as fare_key)
            fareKey: flight.id || flight.fare_key || null
          }
        };
        cartItems.push(newItem);
        localStorage.setItem('cartItems', JSON.stringify(cartItems));

        toast({
          title: t('success', 'Success'),
          description: t('flightAddedToCart', 'Flight has been added to your cart'),
        });
        navigate('/cart');
        return;
      }

      // For logged in users, save to backend
  const response = await api.post('/bookings', {
        flightDetails: {
          from: flight.legs[0].from.city,
          to: flight.legs[0].to.city,
          fromIata: flight.legs[0].from.iata || flight.legs[0].from.iata_code || null,
          toIata: flight.legs[0].to.iata || flight.legs[0].to.iata_code || null,
          departureDate: flight.legs[0].from.date,
          passengers: {
            adults: flight.search_query.adt || 1,
            children: flight.search_query.chd || 0,
            infants: flight.search_query.inf || 0
          },
          // send the entire flight object so the server can persist all displayed details
          selectedFlight: {
            ...flight,
            price: {
              total: flight.price,
              currency: flight.currency
            },
            // Include fare_key for Seeru integration (use id as fare_key)
            fareKey: flight.id || flight.fare_key || null
          }
        }
      });

      if (response.data.success) {
        toast({
          title: t('success', 'Success'),
          description: t('flightAddedToCart', 'Flight has been added to your cart'),
        });
        navigate('/cart');
      } else {
        throw new Error(response.data.message || 'Unknown error occurred');
      }
    } catch (error: unknown) {
      console.error('Cart error:', error);
      let errorMessage = t('addToCartError', 'Failed to add flight to cart. Please try again.');

      if (error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' &&
        'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' &&
        'message' in error.response.data &&
        typeof error.response.data.message === 'string') {
        errorMessage = error.response.data.message;
      }

      toast({
        title: t('error', 'Error'),
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [navigate, t]);

  const [searchType, setSearchType] = useState<'oneWay' | 'roundTrip' | 'multiCity'>('oneWay');

  const handleSearchTypeChange = (type: 'oneWay' | 'roundTrip' | 'multiCity') => {
    setSearchType(type);
    setValue('searchType', type);

    if (type === 'oneWay' || type === 'roundTrip') {
      setValue('flightSegments', [{ from: '', to: '', date: undefined }]);
      setFromAirportNames(['']);
      setToAirportNames(['']);
      setDatePickerOpen([false]);
    } else if (type === 'multiCity' && flightSegments.length < 2) {
      setValue('flightSegments', [
        { from: '', to: '', date: undefined },
        { from: '', to: '', date: undefined }
      ]);
      setFromAirportNames(['', '']);
      setToAirportNames(['', '']);
      setDatePickerOpen([false, false]);
    }

    if (type !== 'roundTrip') {
      setValue('returnDate', undefined);
    }
  };

  const addFlightSegment = () => {
    if (flightSegments.length < 3) {
      setValue('flightSegments', [...flightSegments, { from: '', to: '', date: undefined }]);
      setFromAirportNames(prev => [...prev, '']);
      setToAirportNames(prev => [...prev, '']);
      setDatePickerOpen(prev => [...prev, false]);
    }
  };

  const removeFlightSegment = (index: number) => {
    if (searchType === 'multiCity' && flightSegments.length > 2) {
      const newSegments = flightSegments.filter((_, i) => i !== index);
      setValue('flightSegments', newSegments);
      setFromAirportNames(prev => prev.filter((_, i) => i !== index));
      setToAirportNames(prev => prev.filter((_, i) => i !== index));
      setDatePickerOpen(prev => prev.filter((_, i) => i !== index));
    }
  };

  const getMinDateForSegment = (index: number) => {
    if (index === 0) {
      return new Date();
    }
    const previousDate = flightSegments[index - 1]?.date;
    if (previousDate && previousDate instanceof Date) {
      const nextDay = new Date(previousDate);
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay;
    }
    return new Date();
  };

  return (
    <>
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 py-12">
        <div className="container-custom">
          <h1 className="text-4xl font-bold mb-4">{t('flights', 'رحلات الطيران')}</h1>
          <p className="text-gray-600 max-w-2xl">
            {t('findAndBook', 'ابحث واحجز رحلات الطيران إلى وجهاتك المفضلة. قارن الأسعار واعثر على أفضل العروض.')}
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="py-8 container-custom">
        <Card className="bg-white shadow-md">
          <CardContent className="p-6">
            {/* Flight Type Tabs */}
            <div className="flex space-x-1 rounded-lg bg-gray-100 p-1 mb-6">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${searchType === 'oneWay'
                    ? 'bg-white text-tourtastic-blue shadow'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => handleSearchTypeChange('oneWay')}
              >
                {t('oneWay', 'One Way')}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${searchType === 'roundTrip'
                    ? 'bg-white text-tourtastic-blue shadow'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => handleSearchTypeChange('roundTrip')}
              >
                {t('roundTrip', 'Round Trip')}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${searchType === 'multiCity'
                    ? 'bg-white text-tourtastic-blue shadow'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => handleSearchTypeChange('multiCity')}
              >
                {t('multiCity', 'Multi-City')}
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Flight Segments */}
              <div className="space-y-4">
                {flightSegments.map((segment, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg relative">
                    {/* Remove button for additional segments */}
                    {(searchType === 'multiCity' ? flightSegments.length > 2 : flightSegments.length > 1) && (
                      <button
                        type="button"
                        onClick={() => removeFlightSegment(index)}
                        className="absolute top-2 right-2 h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor={`from-${index}`}>{t('from', 'From')}</Label>
                      <div className="relative">
                        <Input
                          id={`from-${index}`}
                          placeholder={t('departureCity', 'Type 2-3 letters...')}
                          value={fromAirportNames[index] || ''}
                          onChange={(e) => handleFromInputChange(e, index)}
                          autoComplete="off"
                          onFocus={() => {
                            if (fromAirportNames[index]?.length >= 2) {
                              setShowFromSuggestions(index);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowFromSuggestions(null), 150)}
                          className="pr-10"
                        />
                        {fromAirportNames[index] && fromAirportNames[index].includes(' - ') && (
                          <button
                            type="button"
                            aria-label={i18n.language === 'ar' ? 'مسح' : 'Clear'}
                            onClick={() => {
                              setValue(`flightSegments.${index}.from`, '');
                              setFromAirportNames(values => {
                                const newValues = [...values];
                                newValues[index] = '';
                                return newValues;
                              });
                              setFromSuggestions([]);
                              setShowFromSuggestions(null);
                            }}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-red-600"
                          >
                            <span className="text-xs">✖</span>
                          </button>
                        )}
                        {showFromSuggestions === index && fromSuggestions.length > 0 && (
                          <ul className="absolute z-50 bg-white border w-full max-h-48 overflow-y-auto shadow-lg rounded mt-1">
                            {fromSuggestions.map((a, i) => (
                              <li
                                key={`${a.iata_code || 'unknown'}-${i}`}
                                className={`px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm ${i18n.language === 'ar' ? 'text-right' : ''}`}
                                onMouseDown={() => handleFromSuggestionClick(a, index)}
                                dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
                              >
                                <div className={`font-medium ${i18n.language === 'ar' ? 'text-right' : ''}`}>
                                  {i18n.language === 'ar' ? (
                                    <>{a.name_arbic || a.name} - {a.iata_code}</>
                                  ) : (
                                    <>{a.iata_code} - {a.name}</>
                                  )}
                                </div>
                                <div className={`text-gray-500 text-xs ${i18n.language === 'ar' ? 'text-right' : ''}`}>
                                  {i18n.language === 'ar' 
                                    ? `${a.municipality_arbic || a.municipality || a.city}، ${a.country_arbic || a.country}`
                                    : `${a.municipality || a.city}, ${a.country || a.iso_country}`
                                  }
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {errors.flightSegments?.[index]?.from && (
                        <p className="text-sm text-destructive">{errors.flightSegments[index]?.from?.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`to-${index}`}>{t('to', 'To')}</Label>
                      <div className="relative">
                        <Input
                          id={`to-${index}`}
                          placeholder={t('destinationCity', 'Type 2-3 letters...')}
                          value={toAirportNames[index] || ''}
                          onChange={(e) => handleToInputChange(e, index)}
                          autoComplete="off"
                          onFocus={() => {
                            if (toAirportNames[index]?.length >= 2) {
                              setShowToSuggestions(index);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowToSuggestions(null), 150)}
                          className="pr-10"
                        />
                        {toAirportNames[index] && toAirportNames[index].includes(' - ') && (
                          <button
                            type="button"
                            aria-label={i18n.language === 'ar' ? 'مسح' : 'Clear'}
                            onClick={() => {
                              setValue(`flightSegments.${index}.to`, '');
                              setToAirportNames(values => {
                                const newValues = [...values];
                                newValues[index] = '';
                                return newValues;
                              });
                              setToSuggestions([]);
                              setShowToSuggestions(null);
                            }}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-red-600"
                          >
                            <span className="text-xs">✖</span>
                          </button>
                        )}
                        {showToSuggestions === index && toSuggestions.length > 0 && (
                          <ul className="absolute z-50 bg-white border w-full max-h-48 overflow-y-auto shadow-lg rounded mt-1">
                            {toSuggestions.map((a, i) => (
                              <li
                                key={`${a.iata_code || 'unknown'}-${i}`}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                onMouseDown={() => handleToSuggestionClick(a, index)}
                              >
                                <div className={`font-medium ${i18n.language === 'ar' ? 'text-right' : ''}`}>
                                  {i18n.language === 'ar' ? (
                                    <>{a.name_arbic || a.name} - {a.iata_code}</>
                                  ) : (
                                    <>{a.iata_code} - {a.name}</>
                                  )}
                                </div>
                                <div className={`text-gray-500 text-xs ${i18n.language === 'ar' ? 'text-right' : ''}`}>
                                  {i18n.language === 'ar' 
                                    ? `${a.municipality_arbic || a.municipality || a.city}، ${a.country_arbic || a.country}`
                                    : `${a.municipality || a.city}, ${a.country || a.iso_country}`
                                  }
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {errors.flightSegments?.[index]?.to && (
                        <p className="text-sm text-destructive">{errors.flightSegments[index]?.to?.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`date-${index}`}>
                        {t('date', 'Date')}
                        {index > 0 && (
                          <span className="text-xs text-gray-500 ml-1">
                            {flightSegments[index - 1]?.date
                              ? (i18n.language === 'ar'
                                  ? `بعد ${format(flightSegments[index - 1].date, "MMM dd")}`
                                  : `(after ${format(flightSegments[index - 1].date, "MMM dd")})`)
                              : (i18n.language === 'ar' ? '  بعد الرحلة السابقة' : ' (after previous flight)')}
                          </span>
                        )}
                      </Label>
                      <Popover open={datePickerOpen[index]} onOpenChange={open => setDatePickerOpen(prev => {
                        const arr = [...prev];
                        arr[index] = open;
                        return arr;
                      })}>
                        <PopoverTrigger asChild>
                          <Button
                            id={`date-${index}`}
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !segment.date && 'text-muted-foreground'
                            )}
                            onClick={() => setDatePickerOpen(prev => {
                              const arr = [...prev];
                              arr[index] = true;
                              return arr;
                            })}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {segment.date ? (segment.date instanceof Date && !isNaN(segment.date.getTime()) ? format(segment.date, 'dd MMMM yyyy', { locale: i18n.language === 'ar' ? ar : enUS }) : <span>{t('pickDate', 'Pick a date')}</span>) : <span>{t('pickDate', 'Pick a date')}</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={segment.date}
                            onSelect={(date) => {
                              setValue(`flightSegments.${index}.date`, date);
                              setDatePickerOpen(prev => {
                                const arr = [...prev];
                                arr[index] = false;
                                return arr;
                              });
                              // Validate date sequence
                              trigger('flightSegments');
                            }}
                            disabled={(date) => date < getMinDateForSegment(index)}
                            initialFocus
                            locale={i18n.language === 'ar' ? ar : enUS}
                            className={cn('p-3 pointer-events-auto')}
                          />
                        </PopoverContent>
                      </Popover>
                      {errors.flightSegments?.[index]?.date && (
                        <p className="text-sm text-destructive">{errors.flightSegments[index]?.date?.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Search Button - Only show for Multi-City */}
              {searchType === 'multiCity' && flightSegments.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addFlightSegment}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" /> {t('addSearch', 'Add Search')}
                </Button>
              )}

              {/* Return date for Round Trip */}
              {searchType === 'roundTrip' && (
                <div className="p-4 border rounded-lg">
                  <Label>{t('returnDate', 'Return Date')}</Label>
                  <div className="mt-2">
                    <Popover open={returnDatePickerOpen} onOpenChange={open => setReturnDatePickerOpen(open)}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !returnDate && "text-muted-foreground"
                          )}
                          onClick={() => setReturnDatePickerOpen(true)}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {returnDate ? (returnDate instanceof Date && !isNaN(returnDate.getTime()) ? format(returnDate, 'dd MMMM yyyy', { locale: i18n.language === 'ar' ? ar : enUS }) : <span>{t('pickDate', 'Pick a date')}</span>) : <span>{t('pickDate', 'Pick a date')}</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={returnDate}
                          onSelect={(date) => {
                            setValue('returnDate', date);
                            setReturnDatePickerOpen(false);
                          }}
                          disabled={(date) => {
                            const outboundDate = flightSegments?.[0]?.date;
                            return outboundDate ? date <= outboundDate : date < new Date();
                          }}
                          initialFocus
                          locale={i18n.language === 'ar' ? ar : enUS}
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.returnDate && <p className="text-sm text-destructive mt-2">{errors.returnDate.message}</p>}
                  </div>
                </div>
              )}

              {/* Passenger Selection */}
              <div className="p-4 border rounded-lg">
                <Label>{t('passengers', 'Passengers')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {`${passengers.adults} ${t('adults', 'Adults')}` +
                        (passengers.children ? `, ${passengers.children} ${t('children', 'Children')}` : '') +
                        (passengers.infants ? `, ${passengers.infants} ${t('infants', 'Infants')}` : '')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span>{t('adults', 'Adults')}</span>
                        <div className="text-xs text-gray-500">{t('adultDesc', 'Up to 18 years')}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.adults', Math.max(1, passengers.adults - 1))}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center">{passengers.adults}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.adults', passengers.adults + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('children', 'Children')}</span>
                        <div className="text-xs text-gray-500">{t('childDesc', 'Ages 2 to 17')}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.children', Math.max(0, passengers.children - 1))}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center">{passengers.children}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.children', passengers.children + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('infants', 'Infants')}</span>
                        <div className="text-xs text-gray-500">{t('infantDesc', 'Up to 2 years')}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.infants', Math.max(0, passengers.infants - 1))}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center">{passengers.infants}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue('passengers.infants', passengers.infants + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Cabin Class and Direct Flights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label>{t('cabinClass', 'Cabin Class')}</Label>
                  <Select value={cabin} onValueChange={(value) => setValue('cabin', value as 'e' | 'p' | 'b' | 'f')}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectCabin', 'Select cabin class')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="e">{t('economy', 'Economy')}</SelectItem>
                      <SelectItem value="p">{t('premiumEconomy', 'Premium Economy')}</SelectItem>
                      <SelectItem value="b">{t('business', 'Business')}</SelectItem>
                      <SelectItem value="f">{t('first', 'First')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('flightType', 'Flight Type')}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={direct ? 'default' : 'outline'}
                      onClick={() => setValue('direct', true)}
                    >
                      {t('directOnly', 'Direct Only')}
                    </Button>
                    <Button
                      type="button"
                      variant={!direct ? 'default' : 'outline'}
                      onClick={() => setValue('direct', false)}
                    >
                      {t('allFlights', 'All Flights')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Search Button */}
              <Button type="submit" disabled={isSubmitting} className="w-full bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white">
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    {t('searching', 'Searching...')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4" />
                    {t('searchFlights', 'Search Flights')}
                  </div>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      {hasSearched && (
        <div className="container-custom py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Filters Popover Button (replaces sidebar on smaller screens) */}
            <div className="md:col-span-1 flex items-start justify-start md:justify-center">
              {isDesktop ? (
                filtersOpen && (
                  <div className="w-full">
                    <FilterSidebar filters={filters} setFilters={setFilters} availableAirlines={availableAirlines} />
                  </div>
                )
              ) : (
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full md:w-40 px-4 py-2">{t('filters', 'Filters')}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0">
                    <FilterSidebar filters={filters} setFilters={setFilters} availableAirlines={availableAirlines} />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Results */}
            <div className="md:col-span-3">
              <MultiCityFlightResults
                searchSections={searchSections.map(section => {
                  const derivedFlights = section.flights
                    .filter(flight => {
                      // Apply airline filter
                      if (filters.selectedAirlines.length > 0 &&
                        !filters.selectedAirlines.includes(flight.legs[0].segments[0].airline_name)) {
                        return false;
                      }                      // Apply price range filter
                      if (flight.price < filters.priceRange.min ||
                        flight.price > filters.priceRange.max) {
                        return false;
                      }

                      // Apply time of day filter for departure
                      if (filters.timeOfDay.departure.length > 0) {
                        const hour = new Date(flight.legs[0].from.date).getHours();
                        const timeOfDay =
                          hour >= 5 && hour < 12 ? 'morning' :
                            hour >= 12 && hour < 17 ? 'afternoon' :
                              hour >= 17 && hour < 21 ? 'evening' : 'night';

                        if (!filters.timeOfDay.departure.includes(timeOfDay)) {
                          return false;
                        }
                      }

                      return true;
                    })
                    .sort((a, b) => {
                      switch (filters.sortBy) {
                        case 'price_asc':
                          return a.price - b.price;
                        case 'price_desc':
                          return b.price - a.price;
                        case 'duration_asc': {
                          const durationA = new Date(a.legs[0].to.date).getTime() -
                            new Date(a.legs[0].from.date).getTime();
                          const durationB = new Date(b.legs[0].to.date).getTime() -
                            new Date(b.legs[0].from.date).getTime();
                          return durationA - durationB;
                        }
                        default:
                          return 0;
                      }
                    });

                  // Recompute hasMore relative to the derived list and streaming state
                  const hasMoreDerived = section.hasMore || (!section.isComplete) || (derivedFlights.length > section.visibleCount);

                  return {
                    ...section,
                    flights: derivedFlights,
                    hasMore: hasMoreDerived,
                  };
                })}
                passengers={{ adults: passengers.adults, children: passengers.children, infants: passengers.infants }}
                onFlightSelection={handleFlightSelection}
                onLoadMore={loadMore}
                onAddToCart={handleAddToCart}
                selectedFlights={selectedFlights}
                showDetails={showDetails}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Flights;
