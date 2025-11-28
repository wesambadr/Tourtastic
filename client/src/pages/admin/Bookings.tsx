import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
// removed Select imports because we no longer filter by type/status here
import { 
  EyeIcon, 
  Pencil, 
  X, 
  Check,
  ChevronLeft, 
  ChevronRight, 
} from 'lucide-react';
import api from '@/config/api';
import { formatSypFromUsd } from '@/utils/currency';
import { toastSuccess, toastError, confirmDialog } from '@/utils/i18nToast';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Booking type matching server `Booking` model (partial)
interface Passenger {
  firstName?: string;
  lastName?: string;
  dob?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  phone?: string;
  email?: string;
  type?: 'adult' | 'child' | 'infant' | string;
}

interface SelectedFlight {
  flightId?: string;
  airline?: string;
  // timestamps / datetimes (some integrations call these departureTime/arrivalTime,
  // others use departureDate/arrivalDate)
  departureTime?: string;
  arrivalTime?: string;
  departureDate?: string;
  arrivalDate?: string;
  // airport names/codes (optional — not all records include these)
  departureAirport?: string;
  arrivalAirport?: string;
  departureAirportCode?: string;
  arrivalAirportCode?: string;
  price?: { total?: number; currency?: string };
  class?: string;
  raw?: Record<string, unknown>;
  // allow provider-specific fields without strict typing
  [k: string]: unknown;
}

interface FlightDetails {
  from?: string;
  to?: string;
  departureDate?: string;
  // optional airport code fields (some bookings include these at the flightDetails level)
  fromAirportCode?: string;
  toAirportCode?: string;
  passengers?: { adults?: number; children?: number; infants?: number };
  passengerDetails?: Passenger[];
  selectedFlight?: SelectedFlight;
  // provider-specific fields (airport codes, alt names)
  [k: string]: unknown;
}

interface BookingDetails {
  flightDetails?: FlightDetails;
  passengerDetails?: Passenger[];
  selectedFlight?: SelectedFlight;
}

interface BookingType {
  _id?: string;
  id?: string;
  bookingId?: string;
  userId?: { _id?: string; name?: string; email?: string } | string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  type?: string;
  destination?: string;
  bookingDate?: string | Date;
  date?: string;
  details?: BookingDetails | { [k: string]: unknown };
  // Some server DTOs sometimes include these at top-level; allow them as fallbacks
  passengerDetails?: Passenger[];
  selectedFlight?: SelectedFlight;
  flightDetails?: FlightDetails;
  amount?: number | null;
  status: 'pending' | 'confirmed' | 'cancelled' | string;
  ticketInfo?: Record<string, unknown>;
  ticketDetails?: {
    ticketNumber?: string;
    pnr?: string;
    eTicketPath?: string;
    additionalDocuments?: Array<Record<string, unknown>>;
  };
  paymentDetails?: {
    amount?: number;
    currency?: string;
    method?: string;
    status?: string;
  };
  adminData?: { assignedTo?: string; notes?: string; cost?: { amount?: number; currency?: string } };
  createdAt?: string | Date;
  // raw document from server (mapFlightBookingForClient attaches this)
  _raw?: unknown;
}

// Selected booking details typed helper (computed from state)
// will be undefined when no booking is selected
// this declaration exists to please TS/ESLint for later optional chaining

// Axios-like error for typing
type AxiosErrorLike = Error & { response?: { data?: { message?: string } } };

const getErrorMessage = (err: unknown) => {
  const e = err as AxiosErrorLike;
  return e?.response?.data?.message ?? (err instanceof Error ? err.message : String(err));
};

// Convert storage path to accessible URL
const convertStoragePath = (path: string): string => {
  if (!path) return '';
  
  // If it's already a full HTTP URL, return as-is
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  
  // Convert local:// format to /uploads/
  if (path.startsWith('local://')) {
    return `/uploads/${path.replace('local://', '')}`;
  }
  
  // Convert supabase:// format to /uploads/
  if (path.startsWith('supabase://')) {
    const parts = path.replace('supabase://', '').split('/');
    parts.shift(); // Remove bucket name
    return `/uploads/${parts.join('/')}`;
  }
  
  // If it already starts with /uploads/, return as-is
  if (path.startsWith('/uploads/')) {
    return path;
  }
  
  // Default: prepend /uploads/
  return `/uploads/${path}`;
};

// Mock bookings removed — bookings will be loaded from the API at runtime

const AdminBookings: React.FC = () => {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<BookingType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingType | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Pagination
  const PAGE_SIZE = 5;
  const [pendingPage, setPendingPage] = useState(0);
  const [confirmedPage, setConfirmedPage] = useState(0);
  const [donePage, setDonePage] = useState(0);
  // Upload e-ticket dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBooking, setUploadBooking] = useState<BookingType | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTicketNumber, setUploadTicketNumber] = useState('');
  const [uploadPnr, setUploadPnr] = useState('');
  const [uploadAdminNote, setUploadAdminNote] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // Apply search filter to bookings, we'll split by status below
  const searchedBookings = bookings.filter((booking) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
  (booking.customerName || '').toLowerCase().includes(q) ||
  (booking.customerEmail || '').toLowerCase().includes(q) ||
  (booking.destination || '').toLowerCase().includes(q) ||
  String(booking.bookingId || booking.id || booking._id || '').toLowerCase().includes(q)
    );
  });

  // Split bookings by status
  const pendingBookings = searchedBookings.filter(b => b.status === 'pending');
  const confirmedBookings = searchedBookings.filter(b => b.status === 'confirmed');
  // Treat previously "done" reservations as Done for the new UI label.
  const doneBookings = searchedBookings.filter(b => b.status === 'done');

  // Reset pages when search term changes (or when the searched list changes)
  useEffect(() => {
    setPendingPage(0);
    setConfirmedPage(0);
    setDonePage(0);
  }, [searchTerm]);

  // Fetch bookings from admin API
  useEffect(() => {
    let mounted = true;
    const fetchBookings = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try admin-only endpoint first (requires auth). If it fails with 401/403 or network error,
        // attempt a development public fallback endpoint so the page can still display data locally.
        let resp;
        try {
          resp = await api.get('/admin/flight-bookings');
        } catch (e) {
          // If admin call failed due to auth or network, attempt public endpoint (dev-only)
          console.warn('Admin bookings fetch failed, attempting public fallback', e);
          try {
            resp = await api.get('/admin/flight-bookings/public');
          } catch (e2) {
            // rethrow original error for outer catch to handle
            throw e2 || e;
          }
        }

        if (mounted) {
          if (resp?.data?.success) {
            setBookings(resp.data.data || []);
          } else if (Array.isArray(resp?.data)) {
            setBookings(resp.data || []);
          } else {
            // Some server responses may wrap payload differently; try to extract data
            setBookings(resp?.data?.data || resp?.data || []);
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load admin bookings', err);
        const message = getErrorMessage(err);
        setError(message);
        // keep mock data as a fallback for local dev
  setBookings([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchBookings();
    return () => { mounted = false; };
  }, []);

  // Paginated slices
  const pendingTotal = pendingBookings.length;
  const pendingPageCount = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE));
  const pendingPaged = pendingBookings.slice(pendingPage * PAGE_SIZE, (pendingPage + 1) * PAGE_SIZE);

  const confirmedTotal = confirmedBookings.length;
  const confirmedPageCount = Math.max(1, Math.ceil(confirmedTotal / PAGE_SIZE));
  const confirmedPaged = confirmedBookings.slice(confirmedPage * PAGE_SIZE, (confirmedPage + 1) * PAGE_SIZE);

  const doneTotal = doneBookings.length;
  const donePageCount = Math.max(1, Math.ceil(doneTotal / PAGE_SIZE));
  const donePaged = doneBookings.slice(donePage * PAGE_SIZE, (donePage + 1) * PAGE_SIZE);
  
  // Get status badge component
  const getStatusBadge = (status: string) => {
    let badgeClass = '';
    
    switch (status) {
      case 'confirmed':
        badgeClass = 'bg-green-100 text-green-800';
        break;
      case 'pending':
        badgeClass = 'bg-yellow-100 text-yellow-800';
        break;
      case 'done':
        badgeClass = 'bg-blue-100 text-blue-800';
        break;
      default:
        badgeClass = 'bg-gray-100 text-gray-800';
    }

    const displayText = (status === 'done')
      ? t('statu.done')
      : status === 'confirmed'
        ? t('statu.confirmed')
        : status === 'pending'
          ? t('statu.pending')
          : status;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
        {displayText}
      </span>
    );
  };

  const getBookingId = (b: BookingType) => String(b.bookingId || b.id || b._id || '');
  const formatDate = (b: BookingType) => {
    const d = b.date || b.bookingDate || b.createdAt;
    if (!d) return '-';
    try {
      const dt = new Date(d as string);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString();
    } catch {
      return String(d);
    }
  };

  // Compute display amount (price) for a booking: prefer explicit amount, then paymentDetails, adminData.cost, then selectedFlight price
  const getAmount = (b: BookingType) => {
    if (!b) return null;
    if (typeof b.amount === 'number') return b.amount;
    if (b.paymentDetails && typeof b.paymentDetails.amount === 'number') return b.paymentDetails.amount;
    if (b.adminData?.cost && typeof b.adminData.cost.amount === 'number') return b.adminData.cost.amount;
    const det = b.details as BookingDetails | undefined;
    if (det?.selectedFlight?.price && typeof det.selectedFlight.price.total === 'number') return det.selectedFlight.price.total;
    if (det?.flightDetails?.selectedFlight?.price && typeof det.flightDetails.selectedFlight.price.total === 'number') return det.flightDetails.selectedFlight.price.total;
    return null;
  };

  // Prefer the ticket (selected flight) price for display when available
  const getTicketPrice = (b: BookingType) => {
    if (!b) return null;
    const det = b.details as BookingDetails | undefined;
    if (det?.selectedFlight?.price && typeof det.selectedFlight.price.total === 'number') return det.selectedFlight.price.total;
    if (det?.flightDetails?.selectedFlight?.price && typeof det.flightDetails.selectedFlight.price.total === 'number') return det.flightDetails.selectedFlight.price.total;
    if (b.selectedFlight && b.selectedFlight.price && typeof b.selectedFlight.price.total === 'number') return b.selectedFlight.price.total;
    return null;
  };

  // Format passenger counts or passenger details into a human-friendly string
  const formatPassengers = (counts?: { adults?: number; children?: number; infants?: number }, details?: Passenger[]) => {
    if (counts && (typeof counts.adults === 'number' || typeof counts.children === 'number' || typeof counts.infants === 'number')) {
      const adults = typeof counts.adults === 'number' ? counts.adults : 0;
      const children = typeof counts.children === 'number' ? counts.children : 0;
      const infants = typeof counts.infants === 'number' ? counts.infants : 0;
      return `Adults: ${adults}, Children: ${children}, Infants: ${infants}`;
    }
    if (Array.isArray(details) && details.length > 0) {
      return `${details.length} passenger${details.length === 1 ? '' : 's'}`;
    }
    return '-';
  };

  // Extract baggage info from selectedFlight.raw or legs
  const getBaggageInfo = (sel?: SelectedFlight) => {
    if (!sel) return null;
    const raw = sel.raw as Record<string, unknown> | undefined;
    // Top-level fallback
    if (raw && typeof raw['baggage_allowance'] !== 'undefined') return String(raw['baggage_allowance']);
    // legs[].bags structure
    const legs = raw && Array.isArray(raw['legs']) ? (raw['legs'] as unknown[]) : null;
    if (legs && legs.length > 0) {
      const leg0 = legs[0] as Record<string, unknown> | undefined;
      const bags = (leg0 && typeof leg0['bags'] !== 'undefined') ? (leg0['bags'] as Record<string, unknown>) : (raw && typeof raw['bags'] !== 'undefined' ? (raw['bags'] as Record<string, unknown>) : null);
      if (bags) {
        const unit = typeof bags['unit'] === 'string' ? bags['unit'] as string : '';
        const value = (typeof bags['value'] === 'number' || typeof bags['value'] === 'string') ? String(bags['value']) : '';
        // If there are per-type entries (ADT/CHD/INF), build a readable string
        const parts: string[] = [];
        (['ADT','CHD','INF'] as const).forEach(code => {
          if (typeof bags[code] !== 'undefined') {
            const info = bags[code] as Record<string, unknown> | undefined;
            if (!info) return;
            const cabinRaw = info['cabin'];
            let cabin = '';
            if (cabinRaw && typeof cabinRaw === 'object' && typeof (cabinRaw as Record<string, unknown>)['desc'] === 'string') cabin = String((cabinRaw as Record<string, unknown>)['desc']);
            else if (typeof cabinRaw === 'string') cabin = cabinRaw;

            const checkedRaw = info['checked'];
            let checked = '';
            if (checkedRaw && typeof checkedRaw === 'object' && typeof (checkedRaw as Record<string, unknown>)['desc'] === 'string') checked = String((checkedRaw as Record<string, unknown>)['desc']);
            else if (typeof checkedRaw === 'string') checked = checkedRaw;
            const label = code === 'ADT' ? 'Adult' : code === 'CHD' ? 'Child' : 'Infant';
            const items: string[] = [];
            if (cabin) items.push(`cabin: ${cabin}`);
            if (checked) items.push(`checked: ${checked}`);
            if (items.length) parts.push(`${label} (${items.join(', ')})`);
          }
        });
        const overall = value ? `${value}${unit ? ' ' + unit : ''}` : '';
        return parts.length ? (overall ? `${overall} — ${parts.join(' • ')}` : parts.join(' • ')) : (overall || null);
      }
    }
    return null;
  };

  // Extract per-passenger-type price breakdown from selectedFlight.raw.price_breakdowns
  const getPriceBreakdown = (sel?: SelectedFlight) => {
    if (!sel) return null;
    const raw = sel.raw as Record<string, unknown> | undefined;
    const pb = raw && (raw['price_breakdowns'] || raw['priceBreakdowns']) ? (raw['price_breakdowns'] || raw['priceBreakdowns']) as Record<string, unknown> : null;
    if (!pb || typeof pb !== 'object') return null;
    const mapCodeToLabel: Record<string, string> = { ADT: 'Adult', CHD: 'Child', INF: 'Infant' };
    const rows: Array<{ label: string; total?: number; price?: number; tax?: number }> = [];
    Object.keys(pb).forEach(k => {
      const item = pb[k] as Record<string, unknown> | undefined;
      if (item && typeof item === 'object') {
        const total = typeof item['total'] === 'number' ? item['total'] as number : (typeof item['total'] === 'string' && !isNaN(Number(item['total'])) ? Number(item['total']) : undefined);
        const price = typeof item['price'] === 'number' ? item['price'] as number : (typeof item['price'] === 'string' && !isNaN(Number(item['price'])) ? Number(item['price']) : undefined);
        const tax = typeof item['tax'] === 'number' ? item['tax'] as number : (typeof item['tax'] === 'string' && !isNaN(Number(item['tax'])) ? Number(item['tax']) : undefined);
        rows.push({ label: mapCodeToLabel[k] || k, total, price, tax });
      }
    });
    return rows.length ? rows : null;
  };

  // Extract probable airport codes (from/to) from selectedFlight, flightDetails or raw legs/segments
  const getAirportCodes = (sel?: SelectedFlight, flightDet?: FlightDetails) => {
    const result: { from?: string; to?: string } = {};
    // first prefer explicit normalized fields
    if (flightDet?.fromAirportCode) result.from = String(flightDet.fromAirportCode);
    if (flightDet?.toAirportCode) result.to = String(flightDet.toAirportCode);
    if (sel?.departureAirportCode) result.from = result.from || String(sel.departureAirportCode);
    if (sel?.arrivalAirportCode) result.to = result.to || String(sel.arrivalAirportCode);

    // fallback: look into raw legs / segments
    const raw = sel && sel.raw ? sel.raw as Record<string, unknown> : undefined;
    try {
      if ((!result.from || !result.to) && raw) {
        // legs[].from/legs[].to
        const legs = Array.isArray(raw['legs']) ? (raw['legs'] as unknown[]) : null;
        if (legs && legs.length > 0) {
          const firstLeg = legs[0] as Record<string, unknown> | undefined;
          if (!result.from) {
            const lf = firstLeg && firstLeg['from'] as Record<string, unknown> | undefined;
            if (lf && typeof lf['airport'] === 'string') result.from = String(lf['airport']);
            // also check segments[0].from
            const segs = Array.isArray(firstLeg?.['segments']) ? (firstLeg!['segments'] as unknown[]) : null;
            if (!result.from && segs && segs.length > 0) {
              const s0 = segs[0] as Record<string, unknown> | undefined;
              const sfrom = s0 && s0['from'] as Record<string, unknown> | undefined;
              if (sfrom && typeof sfrom['airport'] === 'string') result.from = String(sfrom['airport']);
            }
          }
          if (!result.to) {
            const lt = firstLeg && firstLeg['to'] as Record<string, unknown> | undefined;
            if (lt && typeof lt['airport'] === 'string') result.to = String(lt['airport']);
            // check last segment.to
            const segs = Array.isArray(firstLeg?.['segments']) ? (firstLeg!['segments'] as unknown[]) : null;
            if (!result.to && segs && segs.length > 0) {
              const last = segs[segs.length - 1] as Record<string, unknown> | undefined;
              const sto = last && last['to'] as Record<string, unknown> | undefined;
              if (sto && typeof sto['airport'] === 'string') result.to = String(sto['airport']);
            }
          }
        }
      }
    } catch (e) {
      // ignore parsing errors
    }
    return result;
  };

  // Format an arbitrary date/time value for display
  const formatDateTime = (v?: string | Date | undefined) => {
    if (!v) return '-';
    try {
      const dt = new Date(String(v));
      if (isNaN(dt.getTime())) return String(v);
      return dt.toLocaleString();
    } catch {
      return String(v);
    }
  };

  // Short date only formatter (e.g., 9/20/2025)
  const formatDateNice = (v?: string | Date | undefined) => {
    if (!v) return '-';
    try {
      const dt = new Date(String(v));
      if (isNaN(dt.getTime())) return String(v);
      return dt.toLocaleDateString();
    } catch {
      return String(v);
    }
  };

  // copy helper
  const copyToClipboard = async (text?: string) => {
    if (!text) return;
    try {
      if (navigator && typeof navigator.clipboard !== 'undefined') {
        await navigator.clipboard.writeText(text);
        toastSuccess('تم النسخ', 'Copied');
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toastSuccess('تم النسخ', 'Copied');
      }
    } catch (e) {
      toastError('فشل النسخ', 'Could not copy');
    }
  };

  // typed access to nested details for the selected booking
  // Some bookings store details under `details`, others put fields at the top-level
  // (passengerDetails / selectedFlight). Derive a normalized BookingDetails object.
  const getSelectedDetails = (booking?: BookingType): BookingDetails | undefined => {
    if (!booking) return undefined;
    const det = booking.details as BookingDetails | undefined;
    if (det && (det.flightDetails || det.passengerDetails || det.selectedFlight)) return det;
    const asRecord = booking as unknown as Record<string, unknown>;
    const fallback: BookingDetails = {
      flightDetails: (det && det.flightDetails) || (asRecord['flightDetails'] as BookingDetails['flightDetails']) || undefined,
      passengerDetails: (asRecord['passengerDetails'] as Passenger[] | undefined) || (det && det.passengerDetails) || undefined,
      selectedFlight: (asRecord['selectedFlight'] as SelectedFlight | undefined) || (det && det.selectedFlight) || undefined,
    };
    if (fallback.flightDetails || fallback.passengerDetails || fallback.selectedFlight) return fallback;
    return undefined;
  };

  const selectedDetails = getSelectedDetails(selectedBooking);

  // Actions
  const handleView = (booking: BookingType) => {
    // Fetch fresh details from server to ensure nested fields are present
    (async () => {
      try {
        setLoading(true);
        const id = getBookingId(booking);
        const resp = await api.get(`/admin/flight-bookings/${id}`);
        if (resp?.data?.success) {
          setSelectedBooking(resp.data.data || booking);
        } else if (resp?.data) {
          setSelectedBooking(resp.data || booking);
        } else {
          setSelectedBooking(booking);
        }
        setViewOpen(true);
      } catch (err: unknown) {
        toastError('فشل تحميل بيانات الحجز', 'Failed to load booking details');
        setSelectedBooking(booking);
        setViewOpen(true);
      } finally {
        setLoading(false);
      }
    })();
  };

  // Open upload dialog for confirmed booking
  const openUpload = (booking: BookingType) => {
    setUploadBooking(booking);
    setUploadTicketNumber(booking.ticketDetails?.ticketNumber || '');
    setUploadPnr(booking.ticketDetails?.pnr || '');
    setUploadAdminNote((booking.adminData && booking.adminData.notes) || '');
    setUploadFile(null);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUploadBooking(null);
    setUploadFile(null);
    setUploadTicketNumber('');
    setUploadPnr('');
    setUploadAdminNote('');
    setUploadLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (f) setUploadFile(f);
  };

  const submitUpload = async () => {
    if (!uploadBooking) return;
    const id = getBookingId(uploadBooking);
    const form = new FormData();
  // multer in server expects field name 'ticketFile'
  if (uploadFile) form.append('ticketFile', uploadFile, uploadFile.name);
    if (uploadTicketNumber) form.append('ticketNumber', uploadTicketNumber);
    if (uploadPnr) form.append('pnr', uploadPnr);
    if (uploadAdminNote) form.append('adminNote', uploadAdminNote);
    try {
      setUploadLoading(true);
      // Do not set Content-Type header; let the browser/axios set multipart boundary
      const resp = await api.post(`/admin/flight-bookings/${id}/upload-ticket`, form);
      if (resp?.data?.success) {
        toastSuccess('تم رفع التذكرة بنجاح', 'Ticket uploaded and booking marked Done');
        const updated = resp.data.data;
        setBookings(prev => prev.map(b => ((b._id === updated._id || b.bookingId === updated.bookingId || b.id === updated.id) ? updated : b)));
        closeUpload();
      } else {
        toastError('فشل رفع الملف', 'Upload failed');
      }
    } catch (err: unknown) {
      console.error('Upload error', err);
      toastError('فشل العملية', 'Operation failed');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleCloseView = () => {
    setSelectedBooking(null);
    setViewOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirmDialog('هل أنت متأكد من حذف هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء', 'Delete this booking? This action cannot be undone.')) return;
    try {
  await api.delete(`/admin/flight-bookings/${id}`);
      toastSuccess('تم حذف الحجز', 'Booking deleted');
      setBookings(prev => prev.filter(b => ((b._id || b.bookingId || b.id || '') !== id)));
    } catch (err: unknown) {
      console.error('Delete booking error', err);
      toastError('فشل العملية', 'Operation failed');
    }
  };

  const handleUpdateStatus = async (id: string, status: 'pending' | 'confirmed' | 'cancelled') => {
    if (!['pending','confirmed','cancelled'].includes(status)) {
      toastError('حالة غير صحيحة', 'Invalid status');
      return;
    }
    try {
  const resp = await api.put(`/admin/flight-bookings/${id}`, { status });
      if (resp?.data?.success) {
        toastSuccess('تم تحديث الحالة', 'Status updated');
        setBookings(prev => prev.map(b => ((b._id === id || b.bookingId === id || b.id === id) ? resp.data.data : b)));
      }
    } catch (err: unknown) {
      console.error('Update status error', err);
      toastError('فشل العملية', 'Operation failed');
    }
  };
  
  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-center items-center">
        <h1 className="text-3xl font-bold">{t('admin.bookings.title')}</h1>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px]">
              <Input
                placeholder={t('admin.bookings.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Filters removed - keeping only search input as requested */}
          </div>
        </CardContent>
      </Card>
      {/* Pending Bookings */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('admin.bookings.pendingReservations')}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('bookingId')}</TableHead>
                <TableHead>{t('admin.bookings.customer')}</TableHead>
                <TableHead>{t('destination')}</TableHead>
                <TableHead>{t('date')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('amount')}</TableHead>
                <TableHead className="w-[100px]">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingPaged.length > 0 ? (
                pendingPaged.map((booking, idx) => (
                  <TableRow key={getBookingId(booking) || booking._id || `${booking.customerEmail || 'booking'}-${idx}`}>
                    <TableCell className="font-medium">{getBookingId(booking)}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{booking.customerName || '-'}</div>
                        <div className="text-xs text-gray-500">{booking.customerEmail || ''}</div>
                      </div>
                    </TableCell>
                    <TableCell>{booking.destination}</TableCell>
                    <TableCell>{formatDate(booking)}</TableCell>
                    <TableCell>{getStatusBadge(booking.status)}</TableCell>
                    <TableCell>{(getTicketPrice(booking) != null) ? formatSypFromUsd(getTicketPrice(booking) as number) : (getAmount(booking) != null ? formatSypFromUsd(getAmount(booking) as number) : '-')}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleView(booking)}>
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => handleDelete(getBookingId(booking))} size="sm">{t('delete')}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-gray-500">{t('admin.bookings.noPending')}</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-gray-500">
              {t('admin.bookings.showingRange', {
                from: pendingPage * PAGE_SIZE + (pendingPaged.length ? 1 : 0),
                to: pendingPage * PAGE_SIZE + pendingPaged.length,
                total: pendingTotal,
                segment: t('admin.bookings.pendingReservationsLower')
              })}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => setPendingPage(p => Math.max(0, p - 1))} disabled={pendingPage <= 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('admin.bookings.previous')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPendingPage(p => Math.min(p + 1, pendingPageCount - 1))} disabled={pendingPage >= pendingPageCount - 1}>
                {t('admin.bookings.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmed Bookings */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('admin.bookings.confirmedReservations')}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('bookingId')}</TableHead>
                <TableHead>{t('admin.bookings.customer')}</TableHead>
                <TableHead>{t('destination')}</TableHead>
                <TableHead>{t('date')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('amount')}</TableHead>
                <TableHead className="w-[100px]">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {confirmedPaged.length > 0 ? (
                confirmedPaged.map((booking, idx) => (
                  <TableRow key={getBookingId(booking) || booking._id || `${booking.customerEmail || 'booking'}-${idx}`}>
                    <TableCell className="font-medium">{getBookingId(booking)}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{booking.customerName || '-'}</div>
                        <div className="text-xs text-gray-500">{booking.customerEmail || ''}</div>
                      </div>
                    </TableCell>
                    <TableCell>{booking.destination}</TableCell>
                    <TableCell>{formatDate(booking)}</TableCell>
                    <TableCell>{getStatusBadge(booking.status)}</TableCell>
                    <TableCell>{(getTicketPrice(booking) != null) ? formatSypFromUsd(getTicketPrice(booking) as number) : (getAmount(booking) != null ? formatSypFromUsd(getAmount(booking) as number) : '-')}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleView(booking)}>
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openUpload(booking)} title={t('admin.bookings.uploadAndComplete')}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-gray-500">{t('admin.bookings.noConfirmed')}</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-gray-500">
              {t('admin.bookings.showingRange', {
                from: confirmedPage * PAGE_SIZE + (confirmedPaged.length ? 1 : 0),
                to: confirmedPage * PAGE_SIZE + confirmedPaged.length,
                total: confirmedTotal,
                segment: t('admin.bookings.confirmedReservationsLower')
              })}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmedPage(p => Math.max(0, p - 1))} disabled={confirmedPage <= 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('admin.bookings.previous')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmedPage(p => Math.min(p + 1, confirmedPageCount - 1))} disabled={confirmedPage >= confirmedPageCount - 1}>
                {t('admin.bookings.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cancelled Bookings */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('admin.bookings.doneReservations')}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('bookingId')}</TableHead>
                <TableHead>{t('admin.bookings.customer')}</TableHead>
                <TableHead>{t('destination')}</TableHead>
                <TableHead>{t('date')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('amount')}</TableHead>
                <TableHead className="w-[100px]">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {donePaged.length > 0 ? (
                donePaged.map((booking, idx) => (
                <TableRow key={getBookingId(booking) || booking._id || `${booking.customerEmail || 'booking'}-${idx}`}>
                    <TableCell className="font-medium">{getBookingId(booking)}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{booking.customerName || '-'}</div>
                        <div className="text-xs text-gray-500">{booking.customerEmail || ''}</div>
                      </div>
                    </TableCell>
                    <TableCell>{booking.destination}</TableCell>
                    <TableCell>{formatDate(booking)}</TableCell>
                    <TableCell>{getStatusBadge(booking.status)}</TableCell>
                    <TableCell>{(getTicketPrice(booking) != null) ? formatSypFromUsd(getTicketPrice(booking) as number) : (getAmount(booking) != null ? formatSypFromUsd(getAmount(booking) as number) : '-')}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleView(booking)}>
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => handleDelete(getBookingId(booking))} size="sm">{t('delete')}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-gray-500">{t('admin.bookings.noDone')}</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-gray-500">
              {t('admin.bookings.showingRange', {
                from: donePage * PAGE_SIZE + (donePaged.length ? 1 : 0),
                to: donePage * PAGE_SIZE + donePaged.length,
                total: doneTotal,
                segment: t('admin.bookings.doneReservationsLower')
              })}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => setDonePage(p => Math.max(0, p - 1))} disabled={donePage <= 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('admin.bookings.previous')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDonePage(p => Math.min(p + 1, donePageCount - 1))} disabled={donePage >= donePageCount - 1}>
                {t('admin.bookings.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('booking.detailsTitle')}</DialogTitle>
            <DialogDescription>{t('admin.bookings.detailsFor', { id: selectedBooking ? getBookingId(selectedBooking) : '' })}</DialogDescription>
          </DialogHeader>
          {selectedBooking ? (
            <div className="space-y-3">
              <div className="max-h-[70vh] overflow-auto pr-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <h3 className="font-semibold">{t('admin.bookings.customer')}</h3>
                    <div className="text-sm break-words">{selectedBooking.customerName} &lt;{selectedBooking.customerEmail}&gt;</div>
                    {selectedBooking.customerPhone && <div className="text-sm">{t('phone')}: {selectedBooking.customerPhone}</div>}
                    <div className="mt-2 text-sm">{t('status')}: {getStatusBadge(selectedBooking.status)}</div>
                    <div className="mt-2 text-sm">{t('amount')}: {(getTicketPrice(selectedBooking) != null) ? formatSypFromUsd(getTicketPrice(selectedBooking) as number) : (getAmount(selectedBooking) != null ? formatSypFromUsd(getAmount(selectedBooking) as number) : '-')}</div>
                  </div>

                  <div className="col-span-1">
                    <h3 className="font-semibold">{t('flightDetails')}</h3>
                    <div className="text-sm">{t('destination')}: {selectedBooking.destination || selectedDetails?.flightDetails?.to || '-'}</div>
                    <div className="text-sm">{t('date')}: {formatDate(selectedBooking)}</div>
                    {selectedDetails?.flightDetails && (
                      <div className="mt-2 text-sm">
                        {t('from')}: {selectedDetails.flightDetails.from || '-'} {getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).from ? `(${getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).from})` : ''}
                        <br />
                        {t('to')}: {selectedDetails.flightDetails.to || '-'} {getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).to ? `(${getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).to})` : ''}
                        <br />
                        {t('departure')}: {selectedDetails.flightDetails.departureDate ? formatDateTime(selectedDetails.flightDetails.departureDate) : (selectedDetails.selectedFlight?.departureTime ? formatDateTime(selectedDetails.selectedFlight.departureTime) : '-')}
                        <br />
                        {t('passengers')}: {formatPassengers(selectedDetails?.flightDetails?.passengers, selectedDetails?.passengerDetails)}
                      </div>
                    )}
                  </div>

                  <div className="col-span-1">
                    <h3 className="font-semibold">{t('booking.flightInformation')}</h3>
                    {selectedDetails?.selectedFlight ? (
                      <div className="text-sm">
                        {t('booking.airline')}: {selectedDetails.selectedFlight.airline || '-'}
                        <br />
                        {t('from')}: {selectedDetails.selectedFlight.departureAirport || '-'} {getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).from ? `(${getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).from})` : ''}
                        <br />
                        {t('departure')}: {selectedDetails.selectedFlight.departureTime ? formatDateTime(selectedDetails.selectedFlight.departureTime) : (selectedDetails.selectedFlight.departureDate ? formatDateTime(selectedDetails.selectedFlight.departureDate) : '-')}
                        <br />
                        {t('to')}: {selectedDetails.selectedFlight.arrivalAirport || '-'} {getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).to ? `(${getAirportCodes(selectedDetails.selectedFlight, selectedDetails.flightDetails).to})` : ''}
                        <br />
                        {t('arrivalTime')}: {selectedDetails.selectedFlight.arrivalTime ? formatDateTime(selectedDetails.selectedFlight.arrivalTime) : (selectedDetails.selectedFlight.arrivalDate ? formatDateTime(selectedDetails.selectedFlight.arrivalDate) : '-')}
                        <br />
                        {t('class')}: {selectedDetails.selectedFlight.class || '-'}
                        <br />
                        {t('price')}: {selectedDetails.selectedFlight.price && typeof selectedDetails.selectedFlight.price.total === 'number' ? formatSypFromUsd(selectedDetails.selectedFlight.price.total) : '-'}
                        <br />
                        {(() => { const bag = getBaggageInfo(selectedDetails.selectedFlight); return bag ? <div>{t('baggage')}: <span className="text-sm text-gray-600">{bag}</span></div> : null; })()}
                      </div>
                    ) : (
                      <div className="text-sm">-</div>
                    )}
                  </div>
                </div>

                {/* Price breakdown */}
                {(() => {
                  const pb = getPriceBreakdown(selectedDetails?.selectedFlight);
                  if (!pb) return null;
                  return (
                    <div className="mt-4">
                      <h4 className="font-medium">{t('priceBreakdown')}</h4>
                      <table className="w-full text-sm mt-2 border-collapse">
                        <thead>
                          <tr className="text-left">
                            <th className="pr-4">{t('admin.bookings.type')}</th>
                            <th className="text-right">{t('amount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pb.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-2">{r.label}</td>
                              <td className="py-2 text-right">{typeof r.total === 'number' ? `$${r.total.toFixed(2)}` : (typeof r.price === 'number' ? `$${r.price.toFixed(2)}` : '-')}{r.tax ? ` (tax: $${r.tax.toFixed(2)})` : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Passengers - card/grid side-by-side layout */}
                {selectedDetails?.passengerDetails && Array.isArray(selectedDetails.passengerDetails) && (
                  <div className="mt-4">
                    <h4 className="font-medium">{t('passengers')}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                      {selectedDetails.passengerDetails.map((p, i) => (
                        <div key={i} className="border rounded p-3 bg-white shadow-sm">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{[p.firstName, p.lastName].filter(Boolean).join(' ') || `Passenger ${i+1}`}</div>
                              <div className="text-xs text-gray-500">{p.type || '-'}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div className="text-gray-600">{t('passportNumber')}</div>
                            <div className="font-medium flex items-center">
                              <span className="font-medium">{p.passportNumber || '-'}</span>
                              {p.passportNumber && (
                                <Button variant="ghost" size="sm" className="ml-2" onClick={() => copyToClipboard(p.passportNumber)}>{t('admin.bookings.copy')}</Button>
                              )}
                            </div>

                            <div className="text-gray-600">{t('passportIssueDate')}</div>
                            <div className="font-medium">{p.passportIssueDate ? formatDateNice(p.passportIssueDate) : '-'}</div>

                            <div className="text-gray-600">{t('passportExpiryDate')}</div>
                            <div className="font-medium">{p.passportExpiryDate ? formatDateNice(p.passportExpiryDate) : '-'}</div>

                            <div className="text-gray-600">{t('dob')}</div>
                            <div className="font-medium">{p.dob ? formatDateNice(p.dob) : '-'}</div>

                            <div className="text-gray-600">{t('phone')}</div>
                            <div className="font-medium flex items-center">
                              <span className="break-words">{p.phone || '-'}</span>
                              {p.phone && <Button variant="ghost" size="sm" className="ml-2" onClick={() => copyToClipboard(p.phone)}>{t('admin.bookings.copy')}</Button>}
                            </div>

                            <div className="text-gray-600">{t('email')}</div>
                            <div className="font-medium flex items-center min-w-0">
                              <span className="text-blue-600 break-all">{p.email || '-'}</span>
                              {p.email && <Button variant="ghost" size="sm" className="ml-2 shrink-0" onClick={() => copyToClipboard(p.email)}>{t('admin.bookings.copy')}</Button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* raw booking JSON removed per request */}

                {/* Ticket & payment & admin columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <h4 className="font-medium">{t('booking.ticket')}</h4>
                    <div className="text-sm">PNR: {selectedBooking.ticketDetails?.pnr || '-'}</div>
                    <div className="text-sm">{t('admin.bookings.ticketNumber')}: {selectedBooking.ticketDetails?.ticketNumber || '-'}</div>
                    {selectedBooking.ticketDetails?.eTicketPath && (
                      <div className="text-sm">{t('booking.ticket')}: <a className="text-blue-600 underline" href={convertStoragePath(selectedBooking.ticketDetails.eTicketPath)} target="_blank" rel="noreferrer">{t('booking.openTicket')}</a></div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">{t('paymentDetails')}</h4>
                    <div className="text-sm">{t('amount')}: {(typeof selectedBooking.paymentDetails?.amount === 'number') ? formatSypFromUsd(selectedBooking.paymentDetails!.amount!) : (getAmount(selectedBooking) != null ? formatSypFromUsd(getAmount(selectedBooking) as number) : formatSypFromUsd(0))}</div>
                    <div className="text-sm">{t('admin.bookings.method')}: {selectedBooking.paymentDetails?.method || '-'}</div>
                    <div className="text-sm">{t('status')}: {selectedBooking.paymentDetails?.status || '-'}</div>
                  </div>
                  <div>
                    <h4 className="font-medium">{t('admin.bookings.adminNotes')}</h4>
                    <div className="text-sm">{t('admin.bookings.assignedTo')}: {selectedBooking.adminData?.assignedTo || '-'}</div>
                    <div className="text-sm">{t('admin.bookings.notes')}: {selectedBooking.adminData?.notes || '-'}</div>
                    {selectedBooking.adminData?.cost && typeof selectedBooking.adminData.cost.amount === 'number' && (
                      <div className="text-sm">{t('admin.bookings.adminCost')}: {formatSypFromUsd(selectedBooking.adminData.cost.amount)}</div>
                    )}
                  </div>
                </div>

              </div>
              <div className="pt-2">
                <Button onClick={() => setViewOpen(false)}>{t('cancel')}</Button>
              </div>
            </div>
          ) : (
            <div>{t('loading')}</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.bookings.uploadTitle')}</DialogTitle>
            <DialogDescription>{t('admin.bookings.uploadDescription')}</DialogDescription>
          </DialogHeader>
          {uploadBooking ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <label className="text-sm">{t('booking.ticket')} (PDF)</label>
                <input type="file" accept="application/pdf" onChange={handleFileChange} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="text-sm">{t('admin.bookings.ticketNumber')}</label>
                  <Input value={uploadTicketNumber} onChange={(e) => setUploadTicketNumber(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">PNR</label>
                  <Input value={uploadPnr} onChange={(e) => setUploadPnr(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-sm">{t('admin.bookings.adminNote')}</label>
                <Input value={uploadAdminNote} onChange={(e) => setUploadAdminNote(e.target.value)} />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <Button variant="ghost" onClick={closeUpload} disabled={uploadLoading}>{t('cancel')}</Button>
                <Button onClick={submitUpload} disabled={uploadLoading}>
                  {uploadLoading ? t('admin.bookings.uploading') : t('admin.bookings.saveAndComplete')}
                </Button>
              </div>
            </div>
          ) : (
            <div>{t('loading')}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBookings;
