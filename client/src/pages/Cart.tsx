import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/styles/datepicker.css';
import { Trash2, Plane, Calendar, Users, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import api from '@/config/api';
import { useNavigate } from 'react-router-dom';
import { paymentService } from '@/services/paymentService';
import { useAuthenticatedAction } from '@/hooks/useAuthenticatedAction';
import { getAirlineLogo } from '@/components/flights/utils/flightHelpers';
import { formatSypFromUsd, getSypRate } from '@/utils/currency';

// Arab countries list with English and Arabic names
const ARAB_COUNTRIES = [
  { code: 'DZ', nameEn: 'Algeria', nameAr: 'الجزائر' },
  { code: 'BH', nameEn: 'Bahrain', nameAr: 'البحرين' },
  { code: 'KM', nameEn: 'Comoros', nameAr: 'جزر القمر' },
  { code: 'DJ', nameEn: 'Djibouti', nameAr: 'جيبوتي' },
  { code: 'EG', nameEn: 'Egypt', nameAr: 'مصر' },
  { code: 'IQ', nameEn: 'Iraq', nameAr: 'العراق' },
  { code: 'JO', nameEn: 'Jordan', nameAr: 'الأردن' },
  { code: 'KW', nameEn: 'Kuwait', nameAr: 'الكويت' },
  { code: 'LB', nameEn: 'Lebanon', nameAr: 'لبنان' },
  { code: 'LY', nameEn: 'Libya', nameAr: 'ليبيا' },
  { code: 'MR', nameEn: 'Mauritania', nameAr: 'موريتانيا' },
  { code: 'MA', nameEn: 'Morocco', nameAr: 'المغرب' },
  { code: 'OM', nameEn: 'Oman', nameAr: 'عمان' },
  { code: 'PS', nameEn: 'Palestine', nameAr: 'فلسطين' },
  { code: 'QA', nameEn: 'Qatar', nameAr: 'قطر' },
  { code: 'SA', nameEn: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية' },
  { code: 'SO', nameEn: 'Somalia', nameAr: 'الصومال' },
  { code: 'SD', nameEn: 'Sudan', nameAr: 'السودان' },
  { code: 'SY', nameEn: 'Syria', nameAr: 'سوريا' },
  { code: 'TN', nameEn: 'Tunisia', nameAr: 'تونس' },
  { code: 'AE', nameEn: 'United Arab Emirates', nameAr: 'الإمارات العربية المتحدة' },
  { code: 'YE', nameEn: 'Yemen', nameAr: 'اليمن' }
];

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface FlightBooking {
  _id: string;
  bookingId: string;
  customerName: string;
  customerEmail: string;
  flightDetails: {
    from: string;
    to: string;
    departureDate: string;
    passengers: {
      adults: number;
      children: number;
      infants: number;
    };
    selectedFlight: {
      flightId: string;
      airline: string;
      departureTime: string;
      arrivalTime: string;
      price: {
        total: number;
        currency: string;
      };
      class: string;
    };
  };
  status: string;
  paymentDetails: {
    status: string;
    currency: string;
    transactions: Transaction[];
  };
  createdAt: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  data: FlightBooking[];
}

interface LocalCartItem {
  from: string;
  to: string;
  departureTime: string;
  passengers: {
    adults: number;
    children: number;
    infants: number;
  };
  flightId: string;
  airline: string;
  arrivalTime: string;
  price: number;
  currency: string;
  class: string;
}

const Cart = () => {
  const { t, i18n } = useTranslation();
  const isArabic = (i18n.language || '').toLowerCase().startsWith('ar');
  const navigate = useNavigate();
  const authenticatedAction = useAuthenticatedAction();
  // Simple airport type used for airports API responses
  interface SimpleAirport {
    iata_code: string;
    name: string;
    name_arbic?: string;
    municipality?: string;
    municipality_arbic?: string;
    country?: string;
    country_arbic?: string;
  }
  const [airportsMapAr, setAirportsMapAr] = useState<Record<string, SimpleAirport>>({});
  const [airportsMapEn, setAirportsMapEn] = useState<Record<string, SimpleAirport>>({});
  const [bookings, setBookings] = useState<FlightBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [passengerDialogOpen, setPassengerDialogOpen] = useState(false);
  const [activeBookingForPassengers, setActiveBookingForPassengers] = useState<FlightBooking | null>(null);
  const [passengerForms, setPassengerForms] = useState<PassengerForm[]>([]);
  // Map of index -> array of missing field keys for inline validation in the dialog
  const [passengerFormErrors, setPassengerFormErrors] = useState<Record<number, string[]>>({});

  // Local types to improve type-safety when reading optional fields from bookings
  interface SelectedFlight {
    flightId?: string;
    flightnumber?: string;
    airline?: string;
    airlineCode?: string;
    airline_code?: string;
    airlineLogo?: string;
    airline_logo_url?: string;
    departureTime?: string;
    arrivalTime?: string;
    price?: { total: number; currency: string };
    class?: string;
  }
  interface FlightDetailsLocal {
    from?: string;
    to?: string;
    fromIata?: string;
    toIata?: string;
    departureDate?: string;
    passengers?: { adults: number; children: number; infants: number };
    selectedFlight?: SelectedFlight;
  }

  // Strongly typed passenger form used in the passenger dialog
  interface PassengerForm {
    type: 'adult' | 'child' | 'infant';
    firstName: string;
    lastName: string;
    gender?: string; // M, F, or other
    dob?: string | null;
    passportNumber?: string;
    passportIssueDate?: string | null;
    passportExpiryDate?: string | null;
    passportCountry?: string; // Country of passport issuance
    nationality?: string; // Passenger nationality
    phone?: string;
    email?: string;
  }

  const fetchBookings = useCallback(async () => {
    try {
      // Get items from localStorage first
      const localItems = JSON.parse(localStorage.getItem('cartItems') || '[]');
      
      // Convert local items to FlightBooking format
      const localBookings: FlightBooking[] = localItems.map((item: LocalCartItem & { fromIata?: string; toIata?: string; airlineCode?: string; airlineLogo?: string }, index: number) => ({
        _id: `local_${index}`,
        bookingId: `LOCAL-${index + 1000}`,
        customerName: 'Guest User',
        customerEmail: '',
        flightDetails: {
          from: item.from,
          to: item.to,
          fromIata: item.fromIata || null,
          toIata: item.toIata || null,
          departureDate: item.departureTime,
          passengers: item.passengers,
          selectedFlight: {
            flightId: item.flightId,
            airline: item.airline,
            airlineCode: item.airlineCode || null,
            airlineLogo: item.airlineLogo || null,
            departureTime: item.departureTime,
            arrivalTime: item.arrivalTime,
            price: {
              total: item.price,
              currency: item.currency
            },
            class: item.class
          }
        },
        status: 'pending',
        paymentDetails: {
          status: 'pending',
          currency: item.currency,
          transactions: []
        },
        createdAt: new Date().toISOString()
      }));

      // If user is logged in, also get items from backend and merge
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await api.get<ApiResponse>('/bookings/my');
          if (response.data.success && Array.isArray(response.data.data)) {
            // Merge local and server bookings
            // Include all bookings except those with status 'done' or 'issued'
            // (pending, confirmed are all shown in cart)
            const serverBookings = response.data.data.filter(b => {
              const status = String(b.status || '').toLowerCase();
              return status !== 'done' && status !== 'issued';
            });
            setBookings([...localBookings, ...serverBookings]);
          } else {
            setBookings(localBookings);
            console.error('Invalid response format:', response.data);
          }
        } catch (error) {
          console.error('Error fetching server bookings:', error);
          setBookings(localBookings);
        }
      } else {
        // Include all local bookings (pending, confirmed, etc.)
        // Only exclude 'done' and 'issued' bookings
        setBookings(localBookings.filter((b: FlightBooking) => {
          const status = String(b.status || '').toLowerCase();
          return status !== 'done' && status !== 'issued';
        }));
      }
    } catch (error) {
      console.error('Error loading cart:', error);
      toast({
        title: t('error', 'Error'),
        description: t('fetchBookingsError', 'Failed to load cart items. Please try again.'),
        variant: 'destructive',
      });
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Load airports map for both languages so we can match by English while displaying Arabic (and vice versa)
  useEffect(() => {
    const loadAirportsBoth = async () => {
      try {
        const [respAr, respEn] = await Promise.all([
          api.get(`/airports?lang=ar`),
          api.get(`/airports?lang=en`),
        ]);
        if (respAr.data && Array.isArray(respAr.data.data)) {
          const mapAr: Record<string, SimpleAirport> = {};
          respAr.data.data.forEach((a: SimpleAirport) => { if (a.iata_code) mapAr[a.iata_code] = a; });
          setAirportsMapAr(mapAr);
        }
        if (respEn.data && Array.isArray(respEn.data.data)) {
          const mapEn: Record<string, SimpleAirport> = {};
          respEn.data.data.forEach((a: SimpleAirport) => { if (a.iata_code) mapEn[a.iata_code] = a; });
          setAirportsMapEn(mapEn);
        }
      } catch (err) {
        console.error('Failed to load airports for Cart (both langs):', err);
      }
    };
    loadAirportsBoth();
  }, [i18n.language]);

  // Re-render dialog when language changes to update dropdown text
  useEffect(() => {
    if (passengerDialogOpen) {
      // Force re-render by closing and reopening
      setPassengerDialogOpen(false);
      setTimeout(() => {
        setPassengerDialogOpen(true);
      }, 0);
    }
  }, [i18n.language, passengerDialogOpen]);

  const handleCheckout = () => {
    // Check if user is logged in before proceeding to checkout
    const token = localStorage.getItem('token');
    if (!token) {
      toast({
        title: t('loginRequired', 'Login Required'),
        description: t('pleaseLoginToCheckout', 'Please log in to complete your purchase'),
        variant: 'destructive',
      });
      navigate('/login', { 
        state: { 
          returnUrl: '/cart',
          message: 'Please log in to complete your purchase'
        } 
      });
      return;
    }
    
    // Proceed to checkout
    navigate('/checkout');
  };

  const handleDelete = async (booking: FlightBooking) => {
    try {
      if (booking._id.startsWith('local_')) {
        // Handle local cart item deletion
        const localItems = JSON.parse(localStorage.getItem('cartItems') || '[]');
        const index = parseInt(booking._id.split('_')[1]);
        localItems.splice(index, 1);
        localStorage.setItem('cartItems', JSON.stringify(localItems));
        setBookings(bookings.filter(b => b._id !== booking._id));
      } else {
        // Handle server-side cart item deletion
        await api.delete(`/bookings/${booking._id}`);
        setBookings(bookings.filter(b => b._id !== booking._id));
      }
      toast({
        title: t('success', 'Success'),
        description: t('bookingDeleted', 'Booking has been deleted successfully'),
      });
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast({
        title: t('error', 'Error'),
        description: t('deleteBookingError', 'Failed to delete booking. Please try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleProceedToPayment = async (booking: FlightBooking) => {
    // Ensure passenger details are complete before attempting payment
    if (!isBookingReadyForPayment(booking)) {
      openPassengerDialog(booking);
      toast({
        title: t('passengerDetailsRequiredTitle', 'Passenger details required'),
        description: t('passengerDetailsRequired', 'Please enter passenger details for all travelers before proceeding to payment.'),
        variant: 'destructive',
      });
      return;
    }

    authenticatedAction(async () => {
      try {
        setProcessingPayment(booking._id);
        const amountUsd = booking.flightDetails?.selectedFlight?.price?.total || 0;
        // Convert USD amount to SYP using the exchange rate from localStorage
        const sypRate = getSypRate();
        const amountSyp = Math.round(amountUsd * sypRate);
        console.log(`💰 Payment conversion: ${amountUsd} USD × ${sypRate} = ${amountSyp} SYP`);
        const paymentUrl = await paymentService.initiatePayment(amountSyp, booking.bookingId);
        window.location.href = paymentUrl;
      } catch (error) {
        console.error('Payment initiation error:', error);
        toast({
          title: t('error', 'Error'),
          description: t('paymentInitiationError', 'Failed to initiate payment. Please try again.'),
          variant: 'destructive',
        });
        setProcessingPayment(null);
      }
    });
  };

  const openPassengerDialog = (booking: FlightBooking) => {
    // Build a passenger forms array based on counts
    const counts = booking.flightDetails?.passengers || { adults: 0, children: 0, infants: 0 };
  const arr: PassengerForm[] = [];
  for (let i = 0; i < counts.adults; i++) arr.push({ type: 'adult', firstName: '', lastName: '', gender: '', dob: null, passportNumber: '', passportIssueDate: null, passportExpiryDate: null, passportCountry: '', nationality: '', phone: '', email: '' });
  for (let i = 0; i < counts.children; i++) arr.push({ type: 'child', firstName: '', lastName: '', gender: '', dob: null, passportNumber: '', passportIssueDate: null, passportExpiryDate: null, passportCountry: '', nationality: '', phone: '', email: '' });
  for (let i = 0; i < counts.infants; i++) arr.push({ type: 'infant', firstName: '', lastName: '', gender: '', dob: null, passportNumber: '', passportIssueDate: null, passportExpiryDate: null, passportCountry: '', nationality: '', phone: '', email: '' });

    // If booking already has passengerDetails, prefill from both locations
    // Check booking.passengerDetails first (root level), then flightDetails.passengerDetails
  const existing = (booking as any).passengerDetails || ((booking.flightDetails as unknown) as { passengerDetails?: PassengerForm[] }).passengerDetails || [];
    console.log('📖 Opening passenger dialog for booking:', booking.bookingId);
    console.log('📋 Existing passenger details:', JSON.stringify(existing, null, 2));
    console.log('🔍 Root level passengerDetails:', (booking as any).passengerDetails);
    console.log('🔍 FlightDetails passengerDetails:', ((booking.flightDetails as unknown) as { passengerDetails?: PassengerForm[] }).passengerDetails);
    
    if (existing.length === arr.length) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = { ...arr[i], ...existing[i] };
      }
    }

    console.log('✅ Final passenger forms to display:', JSON.stringify(arr, null, 2));
    setPassengerForms(arr);
    setActiveBookingForPassengers(booking);
    setPassengerDialogOpen(true);
  };

  const handlePassengerFieldChange = (index: number, field: keyof PassengerForm, value: string | null) => {
    setPassengerForms(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as PassengerForm;
      return copy;
    });
    // Clear that field's error when user types
    setPassengerFormErrors(prev => {
      const copy = { ...prev };
      if (copy[index]) {
        copy[index] = copy[index].filter(f => f !== field);
        if (copy[index].length === 0) delete copy[index];
      }
      return copy;
    });
  };

  const validatePassengerForms = (forms: PassengerForm[]) => {
    // helpers
    const parseDate = (v?: string | null) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    const isValidEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isValidPhone = (s?: string) => !!s && /^\+?[0-9\s-]{6,20}$/.test(s);

    const errors: Record<number, string[]> = {};
    const now = new Date();

    for (let i = 0; i < forms.length; i++) {
      const f = forms[i] || ({} as PassengerForm);
      const missing: string[] = [];

      // basic required checks
      if (!f.firstName || String(f.firstName).trim() === '') missing.push('firstName');
      if (!f.lastName || String(f.lastName).trim() === '') missing.push('lastName');
      if (!f.gender || String(f.gender).trim() === '') missing.push('gender');
      if (!f.nationality || String(f.nationality).trim() === '') missing.push('nationality');
      if (!f.passportCountry || String(f.passportCountry).trim() === '') missing.push('passportCountry');

      // DOB: must be a valid date and not in the future
      const dobDate = parseDate(f.dob ?? undefined);
      if (!dobDate) missing.push('dob');
      else if (dobDate > now) missing.push('dob');

      // Passport number
      if (!f.passportNumber || String(f.passportNumber).trim() === '') missing.push('passportNumber');

      // Passport dates: issue <= today, expiry > today and expiry > issue
      const issueDate = parseDate(f.passportIssueDate ?? undefined);
      const expiryDate = parseDate(f.passportExpiryDate ?? undefined);
      if (!issueDate) missing.push('passportIssueDate');
      else if (issueDate > now) missing.push('passportIssueDate');
      if (!expiryDate) missing.push('passportExpiryDate');
      else if (expiryDate <= now) missing.push('passportExpiryDate');
      if (issueDate && expiryDate && expiryDate <= issueDate) {
        // mark both so UI can show appropriate message
        if (!missing.includes('passportIssueDate')) missing.push('passportIssueDate');
        if (!missing.includes('passportExpiryDate')) missing.push('passportExpiryDate');
      }

      // Phone and email
      if (!f.phone || String(f.phone).trim() === '' || !isValidPhone(f.phone)) missing.push('phone');
      if (!f.email || String(f.email).trim() === '' || !isValidEmail(f.email)) missing.push('email');

      if (missing.length) errors[i] = missing;
    }

    return { valid: Object.keys(errors).length === 0, errors };
  };

  const savePassengerDetails = async () => {
    if (!activeBookingForPassengers) return;

    // Validate before saving
    const validation = validatePassengerForms(passengerForms);
    if (!validation.valid) {
      setPassengerFormErrors(validation.errors);
      toast({ title: t('error', 'Error'), description: t('completePassengerDetailsBeforeSave', 'Please complete all required passenger fields before saving.'), variant: 'destructive' });
      return;
    }

    try {
      // If local booking (local_ prefix), update localStorage
      if (activeBookingForPassengers._id.startsWith('local_')) {
        const idx = parseInt(activeBookingForPassengers._id.split('_')[1]);
        const localItems = JSON.parse(localStorage.getItem('cartItems') || '[]');
        if (localItems[idx]) {
          localItems[idx].passengerDetails = passengerForms;
          localStorage.setItem('cartItems', JSON.stringify(localItems));
          // Also update bookings state to reflect saved details
          setBookings(prev => prev.map(b => b._id === activeBookingForPassengers._id ? ({ ...b, flightDetails: { ...((b.flightDetails as unknown) as FlightDetailsLocal), passengerDetails: passengerForms } } as FlightBooking) : b));
        }
        toast({ title: t('success', 'Success'), description: t('passengerDetailsSaved', 'Passenger details saved locally') });
      } else {
        // Server-side booking: call new endpoint to save passengers and trigger Seeru processing
        console.log('📋 Saving passenger details and triggering Seeru booking...');
        console.log('📝 Passenger forms to send:', JSON.stringify(passengerForms, null, 2));
        const payload = { passengerDetails: passengerForms };
        const resp = await api.post(`/bookings/${activeBookingForPassengers._id}/save-passengers`, payload);
        if (resp.data && resp.data.success) {
          console.log('✅ Response from server:', JSON.stringify(resp.data.data.passengerDetails, null, 2));
          setBookings(prev => prev.map(b => b._id === activeBookingForPassengers._id ? resp.data.data : b));
          toast({ 
            title: t('success', 'Success'), 
            description: t('passengerDetailsSaved', 'Passenger details saved and booking is being processed') 
          });
          console.log('✅ Passenger details saved. Seeru booking initiated.');
        } else {
          throw new Error('Failed to save passenger details');
        }
      }
      setPassengerDialogOpen(false);
      setActiveBookingForPassengers(null);
    } catch (err) {
      console.error('Failed to save passenger details:', err);
      toast({ title: t('error', 'Error'), description: t('savePassengerDetailsError', 'Failed to save passenger details. Please try again.'), variant: 'destructive' });
    }
  };

  // Check whether a booking has complete passenger details for payment
  const isBookingReadyForPayment = (booking: FlightBooking) => {
    const counts = booking.flightDetails?.passengers || { adults: 0, children: 0, infants: 0 };
    const expected = (counts.adults || 0) + (counts.children || 0) + (counts.infants || 0);

    // Check both locations: root level first, then flightDetails
    const pd = (booking as any).passengerDetails || ((booking.flightDetails as unknown) as { passengerDetails?: PassengerForm[] }).passengerDetails || [];
    if (!pd || pd.length !== expected) return false;

    const { valid } = validatePassengerForms(pd);
    return valid;
  };

  if (loading) {
    return (
      <div className="container-custom py-8">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-tourtastic-blue border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Dialog key={i18n.language} open={passengerDialogOpen} onOpenChange={setPassengerDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>{t('passengerDetailsTitle', 'Passenger Details')}</DialogTitle>
            <DialogDescription>
              {t('passengerDetailsDesc', 'Please fill in the required passenger information for each traveler.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto py-2">
            {passengerForms.map((p, idx) => (
              <div key={idx} className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold">{`${t('passenger', 'Passenger')} ${idx + 1} - ${t(p.type, p.type)}`}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm">{t('firstName', 'First Name')}</label>
                    <Input value={p.firstName || ''} onChange={(e) => handlePassengerFieldChange(idx, 'firstName', e.target.value)} />
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('firstName') && (
                      <div className="text-sm text-red-600 mt-1">{t('firstNameRequired', 'First name is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('lastName', 'Last Name')}</label>
                    <Input value={p.lastName || ''} onChange={(e) => handlePassengerFieldChange(idx, 'lastName', e.target.value)} />
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('lastName') && (
                      <div className="text-sm text-red-600 mt-1">{t('lastNameRequired', 'Last name is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('gender', 'Gender')}</label>
                    <select value={p.gender || ''} onChange={(e) => handlePassengerFieldChange(idx, 'gender', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue">
                      <option value="">{t('selectGender', 'Select Gender')}</option>
                      <option value="M">{t('male', 'Male')}</option>
                      <option value="F">{t('female', 'Female')}</option>
                    </select>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('gender') && (
                      <div className="text-sm text-red-600 mt-1">{t('genderRequired', 'Gender is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('nationality', 'Nationality')}</label>
                    <select value={p.nationality || ''} onChange={(e) => handlePassengerFieldChange(idx, 'nationality', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue">
                      <option value="">{t('selectNationality', 'Select Nationality')}</option>
                      {ARAB_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>
                          {isArabic ? country.nameAr : country.nameEn}
                        </option>
                      ))}
                    </select>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('nationality') && (
                      <div className="text-sm text-red-600 mt-1">{t('nationalityRequired', 'Nationality is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('dob', 'Date of Birth')}</label>
                    <div className="relative">
                      <DatePicker
                        selected={p.dob ? new Date(p.dob) : null}
                        onChange={(date: Date | null) => handlePassengerFieldChange(idx, 'dob', date ? date.toISOString() : null)}
                        dateFormat="yyyy-MM-dd"
                        maxDate={new Date()}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        scrollableYearDropdown
                        yearDropdownItemNumber={100}
                        placeholderText={t('dobPlaceholder', 'yyyy-mm-dd')}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue"
                      />
                      <Calendar className="datepicker-calendar-icon h-5 w-5 text-gray-400" />
                    </div>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('dob') && (
                      <div className="text-sm text-red-600 mt-1">{t('dobInvalid', 'Please enter a valid date of birth')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('passportNumber', 'Passport Number')}</label>
                    <Input value={p.passportNumber || ''} onChange={(e) => handlePassengerFieldChange(idx, 'passportNumber', e.target.value)} />
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('passportNumber') && (
                      <div className="text-sm text-red-600 mt-1">{t('passportNumberRequired', 'Passport number is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('passportCountry', 'Passport Country')}</label>
                    <select value={p.passportCountry || ''} onChange={(e) => handlePassengerFieldChange(idx, 'passportCountry', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue">
                      <option value="">{t('selectPassportCountry', 'Select Passport Country')}</option>
                      {ARAB_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>
                          {isArabic ? country.nameAr : country.nameEn}
                        </option>
                      ))}
                    </select>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('passportCountry') && (
                      <div className="text-sm text-red-600 mt-1">{t('passportCountryRequired', 'Passport country is required')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('passportIssueDate', 'Passport Issue Date')}</label>
                    <div className="relative">
                      <DatePicker
                        selected={p.passportIssueDate ? new Date(p.passportIssueDate) : null}
                        onChange={(date: Date | null) => handlePassengerFieldChange(idx, 'passportIssueDate', date ? date.toISOString() : null)}
                        dateFormat="yyyy-MM-dd"
                        maxDate={new Date()}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        scrollableYearDropdown
                        yearDropdownItemNumber={100}
                        placeholderText={t('passportIssuePlaceholder', 'yyyy-mm-dd')}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue"
                      />
                      <Calendar className="datepicker-calendar-icon h-5 w-5 text-gray-400" />
                    </div>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('passportIssueDate') && (
                      <div className="text-sm text-red-600 mt-1">{t('passportIssueDateInvalid', 'Invalid passport issue date')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('passportExpiryDate', 'Passport Expiry Date')}</label>
                    <div className="relative">
                      <DatePicker
                        selected={p.passportExpiryDate ? new Date(p.passportExpiryDate) : null}
                        onChange={(date: Date | null) => handlePassengerFieldChange(idx, 'passportExpiryDate', date ? date.toISOString() : null)}
                        dateFormat="yyyy-MM-dd"
                        minDate={new Date()}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        scrollableYearDropdown
                        yearDropdownItemNumber={20}
                        placeholderText={t('passportExpiryPlaceholder', 'yyyy-mm-dd')}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tourtastic-blue"
                      />
                      <Calendar className="datepicker-calendar-icon h-5 w-5 text-gray-400" />
                    </div>
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('passportExpiryDate') && (
                      <div className="text-sm text-red-600 mt-1">{t('passportExpiryDateInvalid', 'Invalid passport expiry date')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('phone', 'Phone')}</label>
                    <Input value={p.phone || ''} onChange={(e) => handlePassengerFieldChange(idx, 'phone', e.target.value)} />
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('phone') && (
                      <div className="text-sm text-red-600 mt-1">{t('phoneInvalid', 'Please enter a valid phone number')}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm">{t('email', 'Email')}</label>
                    <Input value={p.email || ''} onChange={(e) => handlePassengerFieldChange(idx, 'email', e.target.value)} />
                    {passengerFormErrors[idx] && passengerFormErrors[idx].includes('email') && (
                      <div className="text-sm text-red-600 mt-1">{t('emailInvalid', 'Please enter a valid email address')}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPassengerDialogOpen(false); setActiveBookingForPassengers(null); }}>{t('cancel', 'Cancel')}</Button>
              <Button onClick={savePassengerDetails}>{t('save', 'Save')}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="container-custom py-8">
      <h1 className={`text-3xl font-bold mb-8 ${i18n.language === 'ar' ? 'text-center md:text-right' : 'text-center md:text-left'}`}>
        {t('yourBookings', 'حجوزاتك')}
      </h1>

      {!bookings || bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('noBookings', 'لا توجد حجوزات في سلة المشتريات.')}</p>
          <Button
            onClick={() => navigate('/flights')}
            className="mt-4 bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white"
          >
            {t('searchFlights', 'البحث عن رحلات')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          {bookings.map((booking) => {
            // Prefer iata codes when present so we can lookup localized names from airportsMap
            const selected: SelectedFlight = (booking?.flightDetails?.selectedFlight as SelectedFlight) || {};
            const rawAirlineName: string = selected?.airline || 'Unknown Airline';
            const airlineCode: string | null = selected?.airlineCode || selected?.airline_code || null;
            const airlineLogoUrl: string | null = selected?.airlineLogo || selected?.airline_logo_url || null;
            const flightId = selected?.flightId || selected?.flightnumber || 'N/A';

            // Derive a clean, human-friendly flight number from several possible provider fields.
            // Tries multiple common keys and falls back to a sanitized version of whatever we have.
            const getCleanFlightNumber = (sel: unknown) => {
              if (!sel || typeof sel !== 'object') return 'N/A';
              const s = sel as Record<string, unknown>;

              // Safe path getter for unknown-shaped objects
              const getPath = (obj: unknown, path: Array<string | number>): string | undefined => {
                let cur: unknown = obj;
                for (const key of path) {
                  if (cur === null || cur === undefined) return undefined;
                  if (typeof key === 'number') {
                    if (!Array.isArray(cur)) return undefined;
                    cur = (cur as unknown[])[key];
                  } else {
                    if (typeof cur !== 'object') return undefined;
                    const rec = cur as Record<string, unknown>;
                    cur = rec[key];
                  }
                }
                if (cur === null || cur === undefined) return undefined;
                if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
                return undefined;
              };

              // Common fields where providers put flight number (use safe getter)
              const candidates = [
                getPath(s, ['flightId']),
                getPath(s, ['flightnumber']),
                getPath(s, ['flight_no']),
                getPath(s, ['number']),
                getPath(s, ['trip_id']),
                getPath(s, ['flightNumber']),
                getPath(s, ['raw', 'flightnumber']),
                getPath(s, ['raw', 'trip_id']),
                getPath(s, ['raw', 'legs', 0, 'segments', 0, 'flightnumber']),
                getPath(s, ['raw', 'legs', 0, 'segments', 0, 'flight_no'])
              ].filter(Boolean) as string[];

              // Try to find a clear airline-code + number pattern like 'AI123' or 'AI-123'
              const pattern = /[A-Z]{1,3}\s*-?\s*\d{1,4}/i;
              for (const c of candidates) {
                if (!c) continue;
                // If candidate is long JSON or contains braces, try to extract pattern
                if (pattern.test(c)) {
                  const m = c.match(pattern);
                  if (m && m[0]) return m[0].replace(/\s+/g, '').toUpperCase();
                }
              }

              // If nothing matched, fall back to the first short alphanumeric chunk we can extract
              for (const c of candidates) {
                if (!c) continue;
                const short = c.match(/[A-Za-z0-9-]{2,10}/);
                if (short) return short[0].toUpperCase();
              }

              return 'N/A';
            };

            const cleanFlightNumber = getCleanFlightNumber(selected);

            const fd: FlightDetailsLocal = booking?.flightDetails as FlightDetailsLocal || {};
            const fromIata = fd?.fromIata || fd?.from || null;
            const toIata = fd?.toIata || fd?.to || null;

            const departureDate = booking?.flightDetails?.departureDate;
            const passengers = booking?.flightDetails?.passengers || { adults: 0, children: 0, infants: 0 };
            const cabinClass = selected?.class || booking?.flightDetails?.selectedFlight?.class || 'N/A';
            const status = booking?.status || 'pending';
            const price = selected?.price || booking?.flightDetails?.selectedFlight?.price || { total: 0, currency: 'USD' };
            const paymentStatus = booking?.paymentDetails?.status || 'pending';

            // Helper: get airport display name (prefer Arabic when available)
            const getAirportDisplay = (iataOrText: string | null) => {
              if (!iataOrText) return 'N/A';
              let maybeCode: string | null = null;
              if (typeof iataOrText === 'string') {
                const trimmed = iataOrText.trim();
                // Case 1: Already an IATA code (e.g., DAM)
                if (/^[A-Za-z]{3}$/.test(trimmed)) {
                  maybeCode = trimmed.toUpperCase();
                }
                // Case 2: Pattern like "DAM - Damascus International Airport (...)"
                else if (trimmed.includes(' - ')) {
                  const parts = trimmed.split(' - ');
                  if (parts[0] && /^[A-Za-z]{3}$/.test(parts[0].trim())) {
                    maybeCode = parts[0].trim().toUpperCase();
                  }
                }
                // Case 3: Pattern like "... (DAM)"
                if (!maybeCode) {
                  const paren = trimmed.match(/\(([A-Za-z]{3})\)/);
                  if (paren && paren[1]) {
                    maybeCode = paren[1].toUpperCase();
                  }
                }
                // Case 4: Plain city or airport name (Arabic or English) -> try to resolve to IATA by lookup
                if (!maybeCode) {
                  // Extract city token (before comma if exists)
                  const cityToken = trimmed.split(',')[0].trim().toLowerCase();
                  const entriesAr = Object.values(airportsMapAr || {});
                  const entriesEn = Object.values(airportsMapEn || {});
                  // Helper to find exact then contains in a list of entries, with field preferences
                  const findIn = (entries: SimpleAirport[], preferArabic: boolean) => {
                    const exact = entries.find(a => (
                      (preferArabic && a.municipality_arbic && a.municipality_arbic.toLowerCase() === cityToken) ||
                      (!preferArabic && a.municipality && a.municipality.toLowerCase() === cityToken) ||
                      (preferArabic && a.name_arbic && a.name_arbic.toLowerCase() === cityToken) ||
                      (!preferArabic && a.name && a.name.toLowerCase() === cityToken)
                    ));
                    if (exact) return exact;
                    return entries.find(a => (
                      (preferArabic && a.municipality_arbic && a.municipality_arbic.toLowerCase().includes(cityToken)) ||
                      (!preferArabic && a.municipality && a.municipality.toLowerCase().includes(cityToken)) ||
                      (preferArabic && a.name_arbic && a.name_arbic.toLowerCase().includes(cityToken)) ||
                      (!preferArabic && a.name && a.name.toLowerCase().includes(cityToken))
                    ));
                  };
                  // Prioritize Arabic fields if UI is Arabic, else English; then fall back to the other list
                  let found: SimpleAirport | undefined;
                  if (isArabic) {
                    found = findIn(entriesAr, true) || findIn(entriesEn, false);
                  } else {
                    found = findIn(entriesEn, false) || findIn(entriesAr, true);
                  }
                  if (found && found.iata_code) {
                    maybeCode = String(found.iata_code).toUpperCase();
                  }
                }
              }

              // If we recognized a code and it's in either map, build a localized label
              const displayMap = isArabic ? airportsMapAr : airportsMapEn;
              const fallbackMap = isArabic ? airportsMapEn : airportsMapAr;
              if (maybeCode && (displayMap[maybeCode] || fallbackMap[maybeCode])) {
                const a = displayMap[maybeCode] || fallbackMap[maybeCode];
                if (isArabic) {
                  // Prefer city (municipality) in Arabic; fall back to airport Arabic name, then English
                  const city = a.municipality_arbic || a.municipality || '';
                  const name = a.name_arbic || a.name || '';
                  // In Arabic UI, show only the city/name (no IATA code prefix)
                  return city || name || a.iata_code;
                }
                // English UI: prefer city; fall back to airport name; include IATA code only if neither present
                const cityEn = a.municipality || a.municipality_arbic || '';
                const nameEn = a.name || a.name_arbic || '';
                return cityEn || nameEn || a.iata_code;
              }

              // Fallback: return the original text as-is
              return iataOrText;
            };

            // Airline display translation mapping (keeps same names as used elsewhere)
            const airlineTranslations: Record<string, string> = {
              'Flynas': 'طيران ناس',
              'flyadeal': 'طيران أديل',
              'Air Arabia': 'العربية للطيران',
              'EgyptAir': 'مصر للطيران',
              'Emirates': 'طيران الإمارات',
              'Ethiopian Airlines': 'الخطوط الإثيوبية',
              'Etihad Airways': 'الاتحاد للطيران',
              'FlyDubai': 'فلاي دبي',
              'Gulf Air': 'طيران الخليج',
              'Jazeera Airways': 'طيران الجزيرة',
              'Kuwait Airways': 'الخطوط الكويتية',
              'Oman Air': 'الطيران العماني',
              'Qatar Airways': 'الخطوط القطرية',
              'Royal Jordanian': 'الملكية الأردنية',
              'Saudi Arabian Airlines': 'الخطوط السعودية',
              'Turkish Airlines': 'الخطوط التركية'
            };

            const airlineDisplay = i18n.language === 'ar' ? (airlineTranslations[rawAirlineName] || rawAirlineName) : rawAirlineName;

            // Resolve airline logo with fallbacks. Build a prioritized list of candidate URLs
            // Sanitize airline name to produce safer file names (remove punctuation, collapse spaces)
            const normalizedNameForFile = String(rawAirlineName || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const lowerName = normalizedNameForFile.toLowerCase();
            const logoCandidates: string[] = [];
            if (airlineLogoUrl) logoCandidates.push(airlineLogoUrl);
            if (airlineCode) {
              const mapped = getAirlineLogo(String(airlineCode));
              if (mapped) logoCandidates.push(mapped);
            }
            if (rawAirlineName) {
              // Add a few filename variations (sanitized) and lower-cased versions
              if (normalizedNameForFile) {
                logoCandidates.push(`/${normalizedNameForFile}-Logo.png`);
                logoCandidates.push(`/${normalizedNameForFile}-logo.png`);
                logoCandidates.push(`/${normalizedNameForFile}.png`);
                logoCandidates.push(`/${lowerName}-logo.png`);
                logoCandidates.push(`/${lowerName}.png`);
              }
            }
            // Always include placeholder as last resort
            logoCandidates.push('/placeholder.svg');
            // Remove duplicates while keeping order
            const seen = new Set<string>();
            const uniqueCandidates = logoCandidates.filter(s => {
              if (!s) return false;
              if (seen.has(s)) return false;
              seen.add(s);
              return true;
            });

            return (
              <Card key={booking._id} className="p-4 md:p-6 bg-gradient-to-br from-white to-gray-50 border-2 hover:shadow-lg transition-all duration-300">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row justify-between gap-6">
                    {/* Flight Details */}
                    <div className="flex-1 text-center md:text-left">
                      <div className="flex items-center justify-center md:justify-start gap-4 mb-6 bg-tourtastic-blue bg-opacity-10 p-6 rounded-lg">
                        <div className="relative h-24 w-24 flex-shrink-0">
                          <img
                            src={uniqueCandidates[0]}
                            alt={`${airlineDisplay} logo`}
                            className="object-contain w-full h-full"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              try {
                                const current = target.getAttribute('src') || '';
                                const idx = uniqueCandidates.indexOf(current);
                                const next = uniqueCandidates[idx + 1] || '/placeholder.svg';
                                if (next && next !== current) target.src = next;
                              } catch (err) {
                                target.src = '/placeholder.svg';
                              }
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-tourtastic-blue">{airlineDisplay}</h2>
                        <div className={`flex items-center gap-2 ${i18n.language === 'ar' ? 'justify-end' : ''}`}>
                        </div>
                      </div>
                    </div>                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-4 rounded-lg shadow-sm">
                        <div className={`${i18n.language === 'ar' ? 'border-l' : 'border-r'} border-gray-200 ${i18n.language === 'ar' ? 'pl-4' : 'pr-4'}`}>
                          <div className={`flex items-center ${i18n.language === 'ar' ? 'flex-row-reverse' : ''} gap-2 text-tourtastic-blue mb-2`}>
                            <Calendar className="h-4 w-4" />
                            <div className="text-sm font-medium">{i18n.language === 'ar' ? 'المسار' : t('route', 'Route')}</div>
                          </div>
                          <div className={`font-semibold text-lg ${i18n.language === 'ar' ? 'text-right' : 'text-left'}`}>
                            <span className="text-gray-700">{getAirportDisplay(fromIata)}</span>
                            <span className="mx-2 text-tourtastic-blue">{i18n.language === 'ar' ? '←' : '→'}</span>
                            <span className="text-gray-700">{getAirportDisplay(toIata)}</span>
                          </div>
                        </div>

                        <div className={`${i18n.language === 'ar' ? 'border-l' : 'border-r'} border-gray-200 ${i18n.language === 'ar' ? 'pl-4' : 'pr-4'}`}>
                          <div className={`flex items-center ${i18n.language === 'ar' ? 'flex-row-reverse' : ''} gap-2 text-tourtastic-blue mb-2`}>
                            <Calendar className="h-4 w-4" />
                            <div className="text-sm font-medium">{t('departure', 'موعد المغادرة')}</div>
                          </div>
                          <div className={`font-semibold text-lg text-gray-700 ${i18n.language === 'ar' ? 'text-right' : 'text-left'}`}>
                            {departureDate ? format(new Date(departureDate), i18n.language === 'ar' ? 'yyyy/MM/dd hh:mm a' : 'MMM dd, yyyy hh:mm a') : 'N/A'}
                          </div>
                        </div>

                        <div>
                          <div className={`flex items-center ${i18n.language === 'ar' ? 'flex-row-reverse' : ''} gap-2 text-tourtastic-blue mb-2`}>
                            <Users className="h-4 w-4" />
                            <div className="text-sm font-medium">{t('passengers', 'المسافرون')}</div>
                          </div>
                          <div className={`font-semibold text-lg text-gray-700 ${i18n.language === 'ar' ? 'text-right' : 'text-left'}`}>
                            {passengers.adults} {t('adults', 'بالغ')}
                            {passengers.children > 0 && ` ${i18n.language === 'ar' ? '، ' : ', '}${passengers.children} ${t('children', 'طفل')}`}
                            {passengers.infants > 0 && ` ${i18n.language === 'ar' ? '، ' : ', '}${passengers.infants} ${t('infants', 'رضيع')}`}
                          </div>
                        </div>
                      </div>                      <div className="mt-6 flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[200px] bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center gap-2 text-tourtastic-blue mb-2">
                            <div className="text-sm font-medium">{t('class', 'Class')}</div>
                          </div>
                          <div className="font-semibold text-lg text-gray-700">
                            {(() => {
                              const raw = String(cabinClass || '').trim();
                              const normalized = raw.replace(/\s+/g, '_').toLowerCase();

                              // Map common short codes to canonical cabinTypes keys
                              let key = normalized;
                              switch (normalized) {
                                case 'y':
                                case 'e':
                                case 'economy':
                                  key = 'economy';
                                  break;
                                case 'w':
                                case 'pe':
                                case 'premium_economy':
                                  key = 'premium_economy';
                                  break;
                                case 'c':
                                case 'b':
                                case 'business':
                                  key = 'business';
                                  break;
                                case 'f':
                                case 'first':
                                  key = 'first';
                                  break;
                                default:
                                  if (normalized.length <= 2) key = 'economy';
                                  break;
                              }

                              const fallbacks: Record<string, string> = {
                                economy: i18n.language === 'ar' ? 'الدرجة السياحية' : 'Economy Class',
                                premium_economy: i18n.language === 'ar' ? 'الدرجة السياحية المميزة' : 'Premium Economy',
                                business: i18n.language === 'ar' ? 'درجة رجال الأعمال' : 'Business Class',
                                first: i18n.language === 'ar' ? 'الدرجة الأولى' : 'First Class'
                              };

                              return t(`cabinTypes.${key}`, fallbacks[key] || (i18n.language === 'ar' ? 'الدرجة السياحية' : raw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())));
                            })()}
                          </div>
                        </div>

                        <div className="flex-1 min-w-[200px] bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center gap-2 text-tourtastic-blue mb-2">
                            <div className="text-sm font-medium">{t('bookingStatus', 'Booking Status')}</div>
                          </div>
                          <div className={`font-semibold text-lg capitalize ${
                            status === 'pending' ? 'text-yellow-600' : 
                            status === 'confirmed' ? 'text-green-600' : 
                            'text-gray-700'
                          }`}>
                            {status === 'pending' ? t('pending', 'قيد الانتظار') :
                             status === 'confirmed' ? t('confirmed', 'مؤكد') :
                             status}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Price and Actions */}
                    <div className="lg:w-72 flex flex-col justify-between items-center md:items-end">
                      <div className="w-full bg-tourtastic-blue bg-opacity-10 rounded-lg p-4 text-center md:text-right mb-4">
                        <div className={`text-sm font-medium text-tourtastic-blue mb-1 ${i18n.language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {t('totalPrice', 'السعر الإجمالي')}
                      </div>
                      <div className={`text-3xl font-bold text-tourtastic-blue ${i18n.language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {formatSypFromUsd(price.total)}
                      </div>
                      </div>

                      <div className="flex flex-col gap-3 w-full">
                        <Button
                          onClick={() => handleProceedToPayment(booking)}
                          className={`w-full bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white flex items-center justify-center gap-2 py-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 ${i18n.language === 'ar' ? 'flex-row-reverse' : ''}`}
                          disabled={paymentStatus === 'completed' || processingPayment === booking._id || !isBookingReadyForPayment(booking)}
                        >
                          <CreditCard className="h-5 w-5" />
                          {processingPayment === booking._id ? (
                            <span className="animate-pulse text-lg">{t('processing', 'جارٍ المعالجة...')}</span>
                          ) : paymentStatus === 'completed' ? (
                            <span className="text-lg">{t('paid', 'تم الدفع')}</span>
                          ) : (
                            <span className="text-lg">{t('proceedToPayment', 'المتابعة للدفع')}</span>
                          )}
                        </Button>

                        <Button
                          onClick={() => openPassengerDialog(booking)}
                          variant="ghost"
                          className={`w-full border border-gray-200 py-4 rounded-lg ${i18n.language === 'ar' ? 'flex-row-reverse' : ''}`}
                        >
                          {t('enterPassengerDetails', 'Enter Passenger Details')}
                        </Button>

                        <Button
                          onClick={() => handleDelete(booking)}
                          variant="outline"
                          className={`w-full text-red-500 hover:text-red-600 hover:bg-red-50 py-4 rounded-lg border-2 border-red-200 hover:border-red-400 transition-all duration-300 flex items-center justify-center gap-2 ${i18n.language === 'ar' ? 'flex-row-reverse' : ''}`}
                          disabled={String(status).toLowerCase() !== 'pending' || processingPayment === booking._id}
                        >
                          <Trash2 className="h-5 w-5" />
                          <span className="text-lg">{t('delete', 'حذف')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
};

export default Cart;
