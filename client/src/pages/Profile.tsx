import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Star, Plane, Calendar, CreditCard, User, Mail, Phone, Eye, EyeOff } from 'lucide-react';
import { toastSuccess, toastError, toastInfo } from '@/utils/i18nToast';
import apiClient from '@/config/api';
import { formatSypFromUsd } from '@/utils/currency';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface UserProfile {
  _id: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
}

interface FlightPrice {
  total: number;
  currency?: string;
}

interface SelectedFlight {
  airline: string;
  class: string;
  price: FlightPrice;
}

interface FlightPassengers {
  adults: number;
  children: number;
  infants: number;
}

interface FlightDetails {
  from: string;
  to: string;
  departureDate: string;
  selectedFlight: SelectedFlight;
  passengers: FlightPassengers;
}

interface PaymentDetails {
  status: 'pending' | 'confirmed' | 'cancelled';
  amount?: number;
}

interface TimelineEvent {
  status: string;
  date: string;
  notes?: string;
}

interface Booking {
  _id?: string;
  bookingId: string;
  customerName: string;
  customerEmail: string;
  flightDetails: FlightDetails;
  paymentDetails: PaymentDetails;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  timeline: TimelineEvent[];
  // Optional URL stored on the booking pointing to the ticket PDF (or file reference)
  ticketPdfUrl?: string;
}


interface WishlistItem {
  _id: string;
  name: string | { [key: string]: string };
  country: string | { [key: string]: string };
  description?: string | { [key: string]: string };
  image?: string;
  rating?: number;
}



const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<UserProfile> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (!authUser) {
          throw new Error('User not authenticated');
        }

        // Fetch user profile
  const userResponse = await apiClient.get(`/users/${authUser._id}`);
        setUser(userResponse.data.data);
        setEditFormData(userResponse.data.data);

        // Fetch both cart items (pending) and confirmed bookings
        const [cartResponse, bookingsResponse] = await Promise.all([
          apiClient.get('/cart'),
          apiClient.get('/bookings/my')
        ]);
        
        

        // Merge cart items (pending) with confirmed bookings and remove duplicates.
        // Prefer confirmed bookings when a duplicate exists (so confirmed overrides pending cart).
        const cartItems = cartResponse.data.data || [];
        const confirmedBookings = bookingsResponse.data.data || [];

        const bookingMap = new Map<string, Booking>();

        // Add confirmed bookings first (they take precedence)
        confirmedBookings.forEach((b: unknown) => {
          const booking = b as Booking;
          const key = booking._id ?? booking.bookingId ?? JSON.stringify(b);
          bookingMap.set(key, booking);
        });

        // Add cart items only if they don't already exist
        cartItems.forEach((b: unknown) => {
          const booking = b as Booking;
          const key = booking._id ?? booking.bookingId ?? JSON.stringify(b);
          if (!bookingMap.has(key)) {
            bookingMap.set(key, booking);
          }
        });

        const allBookings = Array.from(bookingMap.values());
        setBookings(allBookings);

        // Fetch user's wishlist
        const wishlistResponse = await apiClient.get(`/users/${authUser._id}/wishlist`);
        setWishlist(wishlistResponse.data.data);
      } catch (error) {
        toastError('فشل تحميل بيانات المستخدم', 'Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    if (authUser) {
      fetchUserData();
    }
  }, [authUser]);

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const validatePhone = (phone: string) => {
    // E.164 format validation: + followed by 1-15 digits
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  };

  const validateUsername = (username: string) => {
    // Username must:
    // 1. Start with a letter
    // 2. Contain only letters, numbers, dots, and underscores
    // 3. Be at least 3 characters long
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9._]{2,}$/;
    return usernameRegex.test(username);
  };

  const handleSaveProfile = async () => {
    try {
      if (!authUser) {
        throw new Error('User not authenticated');
      }

      if (!editFormData?.username || !validateUsername(editFormData.username)) {
        toastError('يجب أن يبدأ اسم المستخدم بحرف ويحتوي فقط على حروف وأرقام ونقاط وشرطات سفلية (3 أحرف على الأقل)', 'Username must start with a letter and contain only letters, numbers, dots, and underscores (at least 3 characters)');
        return;
      }

      if (editFormData?.phone && !validatePhone(editFormData.phone)) {
        toastError('الرجاء إدخال رقم هاتف صحيح بالصيغة الدولية (مثال: +1234567890)', 'Please enter a valid phone number in international format (e.g., +1234567890)');
        return;
      }

  const response = await apiClient.put(`/users/${authUser._id}`, editFormData);
      setUser(response.data.data);
      setIsEditing(false);
      toastSuccess('تم تحديث الملف الشخصي بنجاح!', 'Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : ((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update profile');
      toastError('فشل تحديث الملف الشخصي', 'Failed to update profile');
    }
  };
  
  const handleRemoveWishlistItem = async (id: string) => {
    try {
      if (!authUser) {
        throw new Error('User not authenticated');
      }

  await apiClient.delete(`/users/${authUser._id}/wishlist/${id}`);
      setWishlist(wishlist.filter(item => item._id !== id));
      toastSuccess('تم إزالة العنصر من المفضلة', 'Item removed from wishlist');
    } catch (error) {
      console.error('Error removing wishlist item:', error);
      toastError('فشل إزالة العنصر من المفضلة', 'Failed to remove item from wishlist');
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Upcoming</span>;
      case 'completed':
        return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">Completed</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">Cancelled</span>;
      default:
        return null;
    }
  };
  
  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setIsDetailsOpen(true);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString(i18n?.language || 'en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case 'confirmed':
        return t('statu.confirmed', 'تم التأكيد');
      case 'pending':
        return t('statu.pending', 'قيد الانتظار');
      case 'cancelled':
        return t('statu.cancelled', 'ملغي');
      case 'done':
        return t('statu.done', 'منجز');
      default:
        return status;
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toastError('كلمات المرور غير متطابقة', 'Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toastError('يجب أن تكون كلمة المرور ٦ أحرف على الأقل', 'Password must be at least 6 characters');
      return;
    }

    try {
      setIsChangingPassword(true);
  const response = await apiClient.put('/users/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });

      if (response.data.success) {
        toastSuccess('تم تحديث كلمة المرور بنجاح', 'Password updated successfully');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to change password';
      toastError('فشل تغيير كلمة المرور', 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleViewDestination = (destinationId: string) => {
    navigate(`/destinations/${destinationId}`);
  };

  const getLocalizedString = (value: string | { [key: string]: string }): string => {
    if (typeof value === 'string') return value;
    return value[i18n.language] || value.en || Object.values(value)[0] || '';
  };

  // Translate city/country names when possible using i18n keys.
  const slugify = (s: string) =>
    s
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');

  const translatePlace = (raw: string) => {
    if (!raw) return raw;
    // handle "City, Country" or single token
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return raw;
    if (parts.length === 1) {
      const slug = slugify(parts[0]);
      return t(`places.${slug}`, parts[0]);
    }
    // first is city, remaining joined as country
    const city = parts[0];
    const country = parts.slice(1).join(', ');
    const cityTranslated = t(`places.${slugify(city)}`, city);
    const countryTranslated = t(`countries.${slugify(country)}`, country);
    return `${cityTranslated}, ${countryTranslated}`;
  };

  const translateAirline = (name: string) => {
    if (!name) return name;
    // try exact key first, fall back to original name
    return t(`airlines.${name}`, name);
  };

  const getRouteArrow = () => (i18n.language === 'ar' ? '←' : '→');

  const [ticketPreviewUrl, setTicketPreviewUrl] = useState<string | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);

  // When a booking is selected, attempt to obtain a usable ticket URL for preview.
  // Note: server stores uploaded flight tickets on FlightBooking.ticketDetails.eTicketPath
  // or as a local uploads path (e.g. 'uploads/...'). Some legacy fields are also checked.
  const getBookingTicketRawPath = (b: Booking | null) => {
    if (!b) return null;
    return (
      // prefer common/new flight booking field
      (b as any).ticketDetails?.eTicketPath ||
      // older/other variants
      (b as any).ticketUrl ||
      (b as any).ticketPdfUrl ||
      (b as any).ticketDetails?.filePath ||
      (b as any).ticketInfo?.filePath ||
      (b as any).ticketDetails?.additionalDocuments?.[0]?.path ||
      null
    );
  };

  const resolveBookingPreviewUrl = (b: Booking | null) => {
    const raw = getBookingTicketRawPath(b);
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const pathPart = raw.startsWith('/') ? raw : `/${raw}`;
    return `${window.location.origin}${pathPart}`;
  };

  useEffect(() => {
    let mounted = true;
    setTicketPreviewUrl(null);
    if (!selectedBooking) return;

    const raw = getBookingTicketRawPath(selectedBooking);
    if (!raw) return;

    const resolveUrl = (p: string) => {
      if (/^https?:\/\//i.test(p)) return p;
      // Ensure leading slash then prefix origin so browser can fetch local uploads
      const pathPart = p.startsWith('/') ? p : `/${p}`;
      return `${window.location.origin}${pathPart}`;
    };

    const load = async () => {
      try {
        setTicketLoading(true);
        // If raw is already a full URL, use it directly
        if (/^https?:\/\//i.test(raw as string)) {
          if (mounted) setTicketPreviewUrl(raw as string);
          return;
        }

        // If raw looks like a local uploads path, resolve to origin/uploads
        if ((raw as string).startsWith('uploads') || (raw as string).startsWith('/uploads')) {
          const url = resolveUrl(raw as string);
          if (mounted) setTicketPreviewUrl(url);
          return;
        }

        // Otherwise ask backend to produce a usable URL (public or signed)
        try {
          const res = await apiClient.get(`/bookings/${selectedBooking._id}/ticket-url`);
          const url = res?.data?.url || resolveUrl(raw as string);
          if (mounted) setTicketPreviewUrl(url);
        } catch (err) {
          // fallback to resolving raw path locally
          const url = resolveUrl(raw as string);
          if (mounted) setTicketPreviewUrl(url);
        }
      } finally {
        if (mounted) setTicketLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [selectedBooking]);

  // Whether to show the Actions column (only if at least one booking has a ticket and is done)
  const hasActionableBookings = bookings.some(
    (b) => b.status === 'done' && !!resolveBookingPreviewUrl(b)
  );

  return (
    <>
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 py-8 md:py-12">
        <div className="container-custom px-4 md:px-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 md:mb-4">{t('profile.title', 'My Profile')}</h1>
          <p className="text-sm md:text-base text-gray-600">
            {t('profile.intro', 'Manage your account details, view your bookings, and access your saved destinations.')}
          </p>
        </div>
      </div>
      
      <div className="py-8 md:py-12 container-custom px-4 md:px-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tourtastic-blue"></div>
          </div>
        ) : (
          <>
            {/* Profile Card */}
            <Card className="mb-8">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col items-center text-center">
                  {/* Profile Info */}
                  <div className="space-y-4 w-full max-w-md">
                    <div>
                      <h2 className="text-2xl font-bold">{user?.name || 'Loading...'}</h2>
                      <p className="text-gray-600">{user?.email || ''}</p>
                    </div>

                    {user && isEditing ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">{t('name', 'Name')}</Label>
                          <Input
                            id="name"
                            value={editFormData.name}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditing(false);
                              setEditFormData(user);
                            }}
                          >
                            {t('cancel', 'Cancel')}
                          </Button>
                          <Button onClick={handleSaveProfile}>{t('save', 'Save Changes')}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => setIsEditing(!isEditing)}
                        >
                          {t('editProfile', 'Edit Profile')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="bookings" className="space-y-6">
              <TabsList className="w-full md:w-auto">
                <TabsTrigger value="bookings" className="flex-1 md:flex-none">{t('profile.myBookings', 'My Bookings')}</TabsTrigger>
                <TabsTrigger value="wishlist" className="flex-1 md:flex-none">{t('profile.myWishlist', 'My Wishlist')}</TabsTrigger>
                <TabsTrigger value="settings" className="flex-1 md:flex-none">{t('profile.accountSettings', 'Account Settings')}</TabsTrigger>
              </TabsList>
              
              {/* Bookings Tab */}
              <TabsContent value="bookings">
                <Card>
                  <CardContent className="p-4 md:p-6">
                    <h3 className="text-xl font-bold mb-6">{t('myBookings', 'My Bookings')}</h3>
                    
                    {bookings.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16 md:w-20">{t('airline', 'Airline')}</TableHead>
                              <TableHead>{t('bookingId', 'Booking')}</TableHead>
                              <TableHead>{t('flightDetails', 'Flight Details')}</TableHead>
                              <TableHead className="hidden md:table-cell">{t('date', 'Date')}</TableHead>
                              <TableHead>{t('status', 'Status')}</TableHead>
                              <TableHead className="text-right">{t('price', 'Amount')}</TableHead>
                              {hasActionableBookings && (
                                <TableHead className="text-right">{t('actions', 'Actions')}</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bookings.map((booking, idx) => (
                              <TableRow
                                key={`${booking._id ?? booking.bookingId ?? 'booking'}-${idx}`}
                                onClick={() => handleViewDetails(booking)}
                                className="cursor-pointer hover:bg-muted/30"
                              >
                                <TableCell>
                                  {/* CLS fix: explicit width/height for airline logos */}
                                  <img
                                    src={`/${booking.flightDetails.selectedFlight.airline.replace(/\s+/g, '-')}-Logo.png`}
                                    alt={booking.flightDetails.selectedFlight.airline}
                                    width="48"
                                    height="48"
                                    loading="lazy"
                                    className="h-10 w-10 object-contain md:h-12 md:w-12"
                                    onError={(e) => {
                                      e.currentTarget.src = '/placeholder.svg';
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <span className="font-medium">{booking.bookingId}</span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-4">
                                    <div>
                                      <p className="font-medium">{translatePlace(booking.flightDetails.from)} {getRouteArrow()} {translatePlace(booking.flightDetails.to)}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  {formatDate(booking.flightDetails.departureDate)}
                                </TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                    ${booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                                      booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                      booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'}`}>
                                    {translateStatus(booking.status)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatSypFromUsd(booking.flightDetails.selectedFlight.price.total)}
                                </TableCell>
                                {hasActionableBookings && (
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {booking.status === 'done' && resolveBookingPreviewUrl(booking) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(resolveBookingPreviewUrl(booking) as string, '_blank', 'noopener');
                                          }}
                                        >
                                          {t('booking.openTicket', 'Open Ticket (PDF)')}
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500">{t('profile.noBookings', "You don't have any bookings yet.")}</p>
                        <Button className="mt-4">{t('profile.findYourNextTrip', 'Find Your Next Trip')}</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Wishlist Tab */}
              <TabsContent value="wishlist">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-6">{t('profile.myWishlist', 'My Wishlist')}</h3>
                    
                    {wishlist.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {wishlist.map((item) => {
                          return (
                            <Card key={item._id} className="overflow-hidden">
                              <div className="relative h-36">
                                {/* CLS fix: explicit width/height, lazy loading */}
                                <img 
                                  src={item.image || '/placeholder.svg'} 
                                  alt={typeof item.name === 'string' ? item.name : (item.name[i18n.language] || item.name.en || '')}
                                  width="400"
                                  height="144"
                                  loading="lazy"
                                  className="w-full h-full object-cover" 
                                  onError={(e) => {
                                    e.currentTarget.src = '/placeholder.svg';
                                  }}
                                />
                                <button 
                                  onClick={() => handleRemoveWishlistItem(item._id)}
                                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </div>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <h4 className="font-bold">
                                      {item?.name && getLocalizedString(item.name)}
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                      {item?.country && getLocalizedString(item.country)}
                                    </p>
                                  </div>
                                  <div className="flex items-center">
                                    <Star className="h-3 w-3 text-tourtastic-blue mr-1 fill-current" />
                                    <span className="text-xs font-medium">{item?.rating || '-'}</span>
                                  </div>
                                </div>
                                {item?.description && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    {(() => {
                                      const localizedDesc = getLocalizedString(item.description);
                                      return localizedDesc.length > 100
                                        ? `${localizedDesc.substring(0, 100)}...`
                                        : localizedDesc;
                                    })()} 
                                  </p>
                                )}
                                <Button 
                                  size="sm" 
                                  className="w-full mt-2"
                                  onClick={() => handleViewDestination(item._id)}
                                >
                                  View Details
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500">{t('noWishlist', "You haven't saved any destinations yet.")}</p>
                        <Button 
                          className="mt-4"
                          onClick={() => navigate('/destinations')}
                        >
                          {t('exploreDestinations', 'Explore Destinations')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Settings Tab */}
              <TabsContent value="settings">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-6">{t('profile.accountSettings', 'Account Settings')}</h3>

                    {/* Profile details (username, phone) */}
                    <div className="space-y-4 max-w-md mb-6">
                      <div className="space-y-2">
                        <Label htmlFor="username">{t('profile.username', 'Username')}</Label>
                        <Input
                          id="username"
                          name="username"
                          placeholder="johnsmith"
                          pattern="^[a-zA-Z][a-zA-Z0-9._]{2,}$"
                          value={editFormData?.username || user?.username || ''}
                          onChange={(e) => {
                            // Only allow letters, numbers, dots, and underscores
                            const value = e.target.value.replace(/[^a-zA-Z0-9._]/g, '');
                            handleEditFormChange({
                              target: { name: 'username', value }
                            } as React.ChangeEvent<HTMLInputElement>);
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">{t('phone', 'Phone')}</Label>
                        <Input
                          id="phone"
                          name="phone"
                          dir="ltr"
                          placeholder="+1234567890"
                          pattern="^\+[1-9]\d{1,14}$"
                          value={editFormData?.phone || user?.phone || ''}
                          onChange={(e) => {
                            // Only allow numbers and + symbol
                            const value = e.target.value.replace(/[^\d+]/g, '');
                            handleEditFormChange({
                              target: { name: 'phone', value }
                            } as React.ChangeEvent<HTMLInputElement>);
                          }}
                        />
                      </div>

                      <div className="flex justify-center gap-2">
                        <Button variant="outline" onClick={() => { setEditFormData(user); toastInfo('تم إلغاء التغييرات', 'Reverted changes'); }}>
                          {t('cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleSaveProfile}>{t('profile.saveProfile', 'Save Profile')}</Button>
                      </div>
                    </div>

                    <Separator />
                    
                    {/* Change Password Form */}
                    <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">{t('profile.currentPassword', 'Current Password')}</Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showPassword ? "text" : "password"}
                            value={passwordData.currentPassword}
                            onChange={(e) =>
                              setPasswordData({ ...passwordData, currentPassword: e.target.value })
                            }
                            required
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 hover:text-gray-800"
                          >
                            <span aria-label={showPassword ? t('hidePassword', 'Hide Password') : t('showPassword', 'Show Password')}>
                              {showPassword ? (
                                <EyeOff className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <Eye className="h-5 w-5" aria-hidden="true" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">{t('profile.newPassword', 'New Password')}</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNewPassword ? "text" : "password"}
                            value={passwordData.newPassword}
                            onChange={(e) =>
                              setPasswordData({ ...passwordData, newPassword: e.target.value })
                            }
                            required
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 hover:text-gray-800"
                          >
                            <span aria-label={showNewPassword ? t('hidePassword', 'Hide Password') : t('showPassword', 'Show Password')}>
                              {showNewPassword ? (
                                <EyeOff className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <Eye className="h-5 w-5" aria-hidden="true" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t('profile.confirmNewPassword', 'Confirm New Password')}</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            value={passwordData.confirmPassword}
                            onChange={(e) =>
                              setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                            }
                            required
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 hover:text-gray-800"
                          >
                            <span aria-label={showConfirmPassword ? t('hidePassword', 'Hide Password') : t('showPassword', 'Show Password')}>
                              {showConfirmPassword ? (
                                <EyeOff className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <Eye className="h-5 w-5" aria-hidden="true" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                      
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={isChangingPassword}
                      >
                        {isChangingPassword ? t('profile.changingPassword', 'Changing Password...') : t('profile.changePassword', 'Change Password')}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Booking Details Dialog */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
              <DialogContent className="max-w-2xl w-[95vw] md:w-full max-h-[90vh] overflow-y-auto p-0">
                <div className="sticky top-0 bg-white z-10 border-b shadow-sm">
                  <div className="p-4 md:p-6 flex items-center gap-4">
                    {/* CLS fix: explicit width/height for airline logo */}
                    <img
                      src={`/${selectedBooking?.flightDetails?.selectedFlight?.airline?.replace(/\s+/g, '-')}-Logo.png`}
                      alt={selectedBooking?.flightDetails?.selectedFlight?.airline}
                      width="48"
                      height="48"
                      loading="lazy"
                      className="h-12 w-12 object-contain"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    <div>
                      <DialogTitle>{t('booking.detailsTitle', 'تفاصيل الحجز')}</DialogTitle>
                      <DialogDescription>
                        {t('booking.id', 'رقم الحجز')}: {selectedBooking?.bookingId}
                      </DialogDescription>
                    </div>
                  </div>
                </div>
                
                {selectedBooking && (
                  <div className="space-y-4 p-6">
                    {/* Flight Details */}
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <Plane className="h-4 w-4 text-tourtastic-blue" />
                        {t('booking.flightInformation', 'Flight Information')}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">{t('booking.route', 'المسار')}</p>
                          <p className="text-sm font-medium">{translatePlace(selectedBooking.flightDetails.from)} {getRouteArrow()} {translatePlace(selectedBooking.flightDetails.to)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('booking.airline', 'شركة الطيران')}</p>
                          <p className="text-sm font-medium">{translateAirline(selectedBooking.flightDetails.selectedFlight.airline)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('booking.departure', 'المغادرة')}</p>
                          <p className="text-sm font-medium">{formatDate(selectedBooking.flightDetails.departureDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('booking.class', 'الدرجة')}</p>
                          <p className="text-sm font-medium">{t(`cabin.${selectedBooking.flightDetails.selectedFlight.class}`, selectedBooking.flightDetails.selectedFlight.class)}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Passenger Details */}
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                          <User className="h-4 w-4 text-tourtastic-blue" />
                          {t('booking.passengerInformation', 'Passenger Information')}
                        </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">{t('passenge.name', 'الاسم')}</p>
                          <p className="text-sm font-medium">{selectedBooking.customerName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('passenge.email', 'البريد الإلكتروني')}</p>
                          <p className="text-sm font-medium">{selectedBooking.customerEmail}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('passenge.count', 'الركاب')}</p>
                          <p className="text-sm font-medium">
                            {selectedBooking.flightDetails.passengers.adults} {t('passenge.adult', 'بالغ')}
                            {selectedBooking.flightDetails.passengers.children > 0 && `, ${selectedBooking.flightDetails.passengers.children} ${t('passenge.child', 'طفل')}`}
                            {selectedBooking.flightDetails.passengers.infants > 0 && `, ${selectedBooking.flightDetails.passengers.infants} ${t('passenge.infant', 'رضيع')}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Payment Details */}
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-tourtastic-blue" />
                          {t('booking.paymentInformation', 'Payment Information')}
                        </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">{t('payment.amount', 'المبلغ')}</p>
                          <p className="text-sm font-medium">{formatSypFromUsd(selectedBooking.flightDetails.selectedFlight.price.total)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{t('payment.status', 'حالة الدفع')}</p>
                          <p className="text-sm font-medium">{translateStatus(selectedBooking.paymentDetails.status)}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Ticket PDF preview / link */}
                    {ticketLoading ? (
                      <div className="py-4 text-center">{t('booking.loadingTicket', 'Loading ticket...')}</div>
                    ) : (
                      ticketPreviewUrl && selectedBooking.status === 'done' && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h3 className="text-base font-semibold">{t('booking.ticket', 'E-ticket')}</h3>
                          <p className="text-sm text-gray-600">{t('booking.ticketUploaded', 'E-ticket uploaded')}</p>
                          <div className="mt-2">
                            {ticketPreviewUrl.toLowerCase().endsWith('.pdf') ? (
                              <div className="border rounded overflow-hidden">
                                <iframe
                                  src={ticketPreviewUrl}
                                  title={t('booking.ticketPreview', 'Ticket Preview')}
                                  className="w-full h-64"
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">{t('booking.ticketLinkAvailable', 'Ticket file available')}</p>
                            )}
                            <div className="mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                asChild={false}
                                onClick={() => window.open(ticketPreviewUrl as string, '_blank', 'noopener')}
                              >
                                {t('booking.openTicket', 'Open Ticket (PDF)')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </>
                      )
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </>
  );
};

export default Profile;
