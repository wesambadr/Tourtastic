import React, { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plane } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flight } from '../../services/flightService';
import { getAirlineLogo, getTimeOfDay, getTimeOfDayIcon, getTimeOfDayWithColor, formatBaggage } from './utils/flightHelpers';
import { getAirportsMap } from '@/services/airportService';
import { formatSypFromUsd } from '@/utils/currency';

interface FlightCardProps {
  flight: Flight;
  onFlightSelection: (flight: Flight) => void;
  selectedFlight?: Flight;
  showDetails?: string | null;
  onAddToCart?: (flight: Flight) => void;
}

const FlightCard: React.FC<FlightCardProps> = ({
  flight,
  onFlightSelection,
  selectedFlight,
  showDetails,
  onAddToCart
}) => {
  const { t, i18n } = useTranslation();
  const [airportsMap, setAirportsMap] = useState<Record<string, import('@/services/airportService').Airport>>({});
  // mobile inline expansion removed: tapping the compact header will open details via onFlightSelection

  useEffect(() => {
    let mounted = true;
    const lang = i18n.language === 'ar' ? 'ar' : 'en';
    getAirportsMap(lang).then(map => {
      if (mounted) setAirportsMap(map || {});
    }).catch(() => {});
    return () => { mounted = false; };
  }, [i18n.language]);

  // Calculate totals and adult base/tax
  const { totalPrice, adultBase, adultTax } = useMemo(() => {
    const adtPrice = flight.price_breakdowns?.ADT?.price ?? flight.price ?? 0;
    const adtTax = flight.price_breakdowns?.ADT?.tax ?? flight.tax ?? 0;

    const adtTotal = (flight.search_query?.adt || 0) * (adtPrice + adtTax);
    const chdPrice = flight.price_breakdowns?.CHD?.price ?? flight.price ?? 0;
    const chdTax = flight.price_breakdowns?.CHD?.tax ?? flight.tax ?? 0;
    const chdTotal = (flight.search_query?.chd || 0) * (chdPrice + chdTax);
    const infPrice = flight.price_breakdowns?.INF?.price ?? flight.price ?? 0;
    const infTax = flight.price_breakdowns?.INF?.tax ?? flight.tax ?? 0;
    const infTotal = (flight.search_query?.inf || 0) * (infPrice + infTax);

    return {
      totalPrice: adtTotal + chdTotal + infTotal,
      adultBase: adtPrice,
      adultTax: adtTax,
    };
  }, [flight.price_breakdowns, flight.price, flight.tax, flight.search_query]);

  // Helper: return localized airline name. Try by airline_name (English full name), then by IATA code,
  // then fall back to the original provided name.
  const getLocalizedAirline = (airlineName?: string, airlineCode?: string) => {
    if (!airlineName && !airlineCode) return '';
    // Try exact airline name key
    if (airlineName) {
      const key = `airlines.${airlineName}`;
      if (i18n.exists && i18n.exists(key)) return t(key);
    }

    // Try common normalized forms (trimmed)
    if (airlineName) {
      const norm = airlineName.trim();
      const keyNorm = `airlines.${norm}`;
      if (i18n.exists && i18n.exists(keyNorm)) return t(keyNorm);
    }

    // Try by IATA code
    if (airlineCode) {
      const keyCode = `airlines.${airlineCode}`;
      if (i18n.exists && i18n.exists(keyCode)) return t(keyCode);
    }

    // As a last attempt, try using the raw airlineName via t to let i18n handle fallbacks/defaults
    return airlineName || airlineCode || '';
  };

  return (
    <Card className={`p-4 md:p-6 hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 ${
      selectedFlight?.trip_id === flight.trip_id 
        ? 'border-l-tourtastic-blue bg-blue-50' 
        : 'border-l-transparent hover:border-l-tourtastic-blue'
    }`}>
      {/* Compact header for mobile: tap the ticket to open details (buttons removed on mobile) */}
      <div
        className="md:hidden flex items-center justify-between gap-4 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => onFlightSelection(flight)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlightSelection(flight); } }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* CLS fix: explicit width/height for airline logos */}
          <img 
            src={getAirlineLogo(flight.legs[0].segments[0].iata)} 
            alt={flight.legs[0].segments[0].iata}
            width="40"
            height="40"
            loading="lazy"
            className="h-10 w-10 object-contain"
            onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {(() => {
                const arrow = i18n?.language === 'ar' ? '←' : '→';
                const fromCity = (airportsMap[flight.legs[0].segments[0].from.airport]?.municipality) || flight.legs[0].segments[0].from.city || '';
                const toCity = (airportsMap[flight.legs[0].segments.slice(-1)[0].to.airport]?.municipality) || flight.legs[0].segments.slice(-1)[0].to.city || '';
                return `${fromCity} ${arrow} ${toCity}`;
              })()}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {flight.legs[0].segments[0].iata} {flight.legs[0].segments[0].flightnumber}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">{formatSypFromUsd(totalPrice)}</div>
            <div className="text-xs text-gray-500">{t('perPerson', 'per person')}</div>
          </div>
          {/* mobile: remove explicit select/details buttons to make the whole ticket tappable */}
        </div>
      </div>

  {/* Full content: hidden on mobile, visible on md+ only (mobile opens details via parent) */}
  <div className="hidden md:block">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Flight Info Section */}
        <div className="flex-1 space-y-4">
          {/* Date and Flight Number */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-medium">
              {t(`months.${format(new Date(flight.legs[0].segments[0].from.date), 'MMM')}`, {
                Jan: 'يناير',
                Feb: 'فبراير',
                Mar: 'مارس',
                Apr: 'أبريل',
                May: 'مايو',
                Jun: 'يونيو',
                Jul: 'يوليو',
                Aug: 'أغسطس',
                Sep: 'سبتمبر',
                Oct: 'أكتوبر',
                Nov: 'نوفمبر',
                Dec: 'ديسمبر'
              }[format(new Date(flight.legs[0].segments[0].from.date), 'MMM')])}{' '}
              {format(new Date(flight.legs[0].segments[0].from.date), 'dd')},{' '}
              {format(new Date(flight.legs[0].segments[0].from.date), 'yyyy')}
            </span>
            <span>•</span>
            <span>{flight.legs[0].segments[0].flightnumber}</span>
          </div>
          
          {flight.legs.map((leg, legIndex) => (
            <div key={legIndex} className="space-y-3">
              {/* Airline Info */}
              <div className="flex items-center gap-3">
                {/* CLS fix: explicit width/height for airline logos */}
                <img 
                  src={getAirlineLogo(leg.segments[0].iata)} 
                  alt={leg.segments[0].iata}
                  width="160"
                  height="160"
                  loading="lazy"
                  className="h-20 w-20 sm:h-32 sm:w-32 lg:h-40 lg:w-40 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {getLocalizedAirline(leg.segments[0].airline_name, leg.segments[0].iata)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {leg.segments[0].iata} {leg.segments[0].flightnumber}
                  </div>
                </div>
              </div>
              
              {/* Flight Route */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-4">
                {/* Departure */}
                <div className="w-[45%] sm:w-auto sm:flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl sm:text-2xl font-bold text-gray-900">
                      {format(new Date(leg.segments[0].from.date), 'HH:mm')}
                    </span>
                    <div className="flex items-center gap-1">
                      {getTimeOfDayIcon(leg.segments[0].from.date)}
                      <span className={`text-xs ${getTimeOfDayWithColor(leg.segments[0].from.date).color}`}>
                        {t(`timeOfDay.${getTimeOfDay(leg.segments[0].from.date)}`, getTimeOfDayWithColor(leg.segments[0].from.date).text)}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-700 truncate max-w-[120px] sm:max-w-[150px]">
                    {
                      airportsMap[leg.segments[0].from.airport]?.name ||
                      t(`airports.${leg.segments[0].from.airport}`, leg.segments[0].from.airport)
                    }
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[150px]">
                    {
                      airportsMap[leg.segments[0].from.airport]?.municipality ||
                      t(`cities.${leg.segments[0].from.city}`, leg.segments[0].from.city)
                    }
                  </div>
                </div>
                
                {/* Flight Duration and Stops */}
                <div className="w-[30%] sm:w-auto sm:flex-1 text-center px-2 mx-1">
                  <div className="text-xs sm:text-sm text-gray-600 mb-1 text-center">
                    {(() => {
                      // Prefer server formatted duration only if it matches current language.
                      // Always compute using i18n to ensure language-correct labels.
                      const totalMinutes = Math.max(0, leg.duration || 0);
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      if (hours > 0) {
                        return `${hours} ${t('hour', { count: hours })} ${minutes} ${t('minute', { count: minutes })}`;
                      }
                      return `${minutes} ${t('minute', { count: minutes })}`;
                    })()}
                  </div>
                  <div className="hidden sm:flex items-center justify-center mb-1">
                    <div className="h-px bg-gray-300 flex-1"></div>
                    <Plane className="h-4 w-4 text-tourtastic-blue mx-2" />
                    <div className="h-px bg-gray-300 flex-1"></div>
                  </div>
                  <div className="flex sm:hidden items-center justify-center mb-1">
                    <div className="h-px bg-gray-300 flex-1 max-w-[30px]"></div>
                    <Plane className="h-3 w-3 text-tourtastic-blue mx-1" />
                    <div className="h-px bg-gray-300 flex-1 max-w-[30px]"></div>
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">
                    {leg.stops_count === 0 ? t('direct') : 
                     leg.stops_count === 1 ? t('oneStop') : 
                     t('multipleStops', { count: leg.stops_count })}
                  </div>
                </div>                {/* Arrival */}
                <div className="w-[45%] sm:w-auto sm:flex-1 flex flex-col ml-auto">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <div className="flex items-center gap-1">
                      {getTimeOfDayIcon(leg.segments[leg.segments.length - 1].to.date)}
                      <span className={`text-xs ${getTimeOfDayWithColor(leg.segments[leg.segments.length - 1].to.date).color}`}>
                        {t(`timeOfDay.${getTimeOfDay(leg.segments[leg.segments.length - 1].to.date)}`, getTimeOfDayWithColor(leg.segments[leg.segments.length - 1].to.date).text)}
                      </span>
                    </div>
                    <span className="text-xl sm:text-2xl font-bold text-gray-900">
                      {format(new Date(leg.segments[leg.segments.length - 1].to.date), 'HH:mm')}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-700 truncate max-w-[120px] sm:max-w-[150px] ml-auto">
                    {
                      airportsMap[leg.segments[leg.segments.length - 1].to.airport]?.name ||
                      t(`airports.${leg.segments[leg.segments.length - 1].to.airport}`, leg.segments[leg.segments.length - 1].to.airport)
                    }
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[150px] ml-auto">
                    {
                      airportsMap[leg.segments[leg.segments.length - 1].to.airport]?.municipality ||
                      t(`cities.${leg.segments[leg.segments.length - 1].to.city}`, leg.segments[leg.segments.length - 1].to.city)
                    }
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Price and Action Section */}
        <div className="flex flex-col items-center lg:items-end gap-3 w-full lg:w-auto lg:min-w-[220px] px-2 sm:px-4">
          {/* Black price: adult base */}
          <div className="text-xl sm:text-2xl font-bold text-center lg:text-right break-words">
            {formatSypFromUsd(adultBase)}
          </div>
          <div className="text-xs text-gray-600 text-center lg:text-right whitespace-normal">
            {t('perAdult', 'للبالغ')} {t('base', 'السعر الأساسي')}
          </div>
          {/* Adult tax line */}
          <div className="text-xs text-gray-600 text-center lg:text-right whitespace-normal">
            {t('tax', 'الضرائب')}: {formatSypFromUsd(adultTax)}
          </div>

          {/* Passenger counts */}
          <div className="text-xs text-gray-700 text-center lg:text-right">
            {(flight.search_query?.adt || 0) > 0 && `${flight.search_query.adt} ${t('adults', 'بالغ')}`}
            {(flight.search_query?.chd || 0) > 0 && ` ${flight.search_query.chd} ${t('children', 'طفل')}`}
            {(flight.search_query?.inf || 0) > 0 && ` ${flight.search_query.inf} ${t('infants', 'رضيع')}`}
          </div>
          
          {/* Blue total */}
          <div className="text-xs font-semibold text-tourtastic-blue text-center lg:text-right">
            {t('total', 'المجموع')}: {formatSypFromUsd(totalPrice)}
          </div>

          <div className="text-xs text-gray-600 text-center lg:text-right flex items-center justify-center lg:justify-end gap-1 px-2 max-w-full">
            <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m0-10L4 7m8 4v10l-8 4m0-10L4 7m8 4v10l-8 4" />
            </svg>
            <span className="truncate">{t('baggage', 'الأمتعة')}: {formatBaggage(flight.baggage_allowance || flight.legs[0]?.bags?.ADT?.checked?.desc || '', t)}</span>
          </div>
          <Button
            onClick={() => {
              if (selectedFlight?.trip_id === flight.trip_id && showDetails === flight.trip_id) {
                onFlightSelection(null);
              } else {
                onFlightSelection(flight);
              }
            }}
            className="w-full lg:w-auto bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg dir-rtl"
          >
            {selectedFlight?.trip_id === flight.trip_id ? (
              <div className="flex items-center gap-2">
                <span>✓</span>
                {showDetails === flight.trip_id ? t('collapse', 'طي التفاصيل') : t('selected', 'تم الاختيار')}
              </div>
            ) : (
              t('select', 'اختيار الرحلة')
            )}
          </Button>
        </div>
      </div>
     </div> 
    </Card>
  );
};

export default FlightCard;