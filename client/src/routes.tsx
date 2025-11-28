import { Routes, Route, Outlet } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/layout/Layout';
import { RequireAuth } from './providers/RequireAuth';
import { RequireAdmin } from './providers/RequireAdmin';

// Lazy load components
const Home = lazy(() => import('./pages/Home'));
const Flights = lazy(() => import('./pages/Flights'));
const Destinations = lazy(() => import('./pages/Destinations'));
const DestinationDetails = lazy(() => import('./pages/DestinationDetails'));
const ProductManagement = lazy(() => import('./pages/ProductManagement'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const Cart = lazy(() => import('./pages/Cart'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const AdminBookings = lazy(() => import('./pages/admin/Bookings'));
const AdminProfile = lazy(() => import('./pages/admin/Profile'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminDestinations = lazy(() => import('./pages/admin/Destinations'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminSupport = lazy(() => import('./pages/admin/Support'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
// Support pages
const Support247 = lazy(() => import('./pages/support/Support247'));
const HelpCenter = lazy(() => import('./pages/support/HelpCenter'));
const FAQs = lazy(() => import('./pages/support/FAQs'));
const BookingPolicy = lazy(() => import('./pages/support/BookingPolicy'));
const PrivacyPolicy = lazy(() => import('./pages/support/PrivacyPolicy'));
const TermsConditions = lazy(() => import('./pages/support/TermsConditions'));
const CookiePolicy = lazy(() => import('./pages/support/CookiePolicy'));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tourtastic-blue"></div>
  </div>
);

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public + User Routes wrapped by main site Layout (Header/Footer present) */}
      <Route element={<Layout><Outlet /></Layout>}>
        <Route index element={<Suspense fallback={<PageLoader />}><Home /></Suspense>} />
        <Route path="/flights" element={<Suspense fallback={<PageLoader />}><Flights /></Suspense>} />
        <Route path="/destinations" element={<Suspense fallback={<PageLoader />}><Destinations /></Suspense>} />
        <Route path="/destinations/:destinationId" element={<Suspense fallback={<PageLoader />}><DestinationDetails /></Suspense>} />
        <Route path="/products" element={<Suspense fallback={<PageLoader />}><ProductManagement /></Suspense>} />
        <Route path="/about" element={<Suspense fallback={<PageLoader />}><About /></Suspense>} />
        <Route path="/contact" element={<Suspense fallback={<PageLoader />}><Contact /></Suspense>} />
        <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<PageLoader />}><Register /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
        <Route path="/payment/success" element={<Suspense fallback={<PageLoader />}><PaymentSuccess /></Suspense>} />
        <Route path="/cart" element={<Suspense fallback={<PageLoader />}><Cart /></Suspense>} />

        {/* Protected User Routes (still use main Layout) */}
        <Route path="/profile" element={<RequireAuth><Suspense fallback={<PageLoader />}><Profile /></Suspense></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Suspense fallback={<PageLoader />}><Notifications /></Suspense></RequireAuth>} />

        {/* Support Pages */}
        <Route path="/support/247-support" element={<Suspense fallback={<PageLoader />}><Support247 /></Suspense>} />
        <Route path="/support/help-center" element={<Suspense fallback={<PageLoader />}><HelpCenter /></Suspense>} />
        <Route path="/support/faqs" element={<Suspense fallback={<PageLoader />}><FAQs /></Suspense>} />
        <Route path="/support/booking-policy" element={<Suspense fallback={<PageLoader />}><BookingPolicy /></Suspense>} />
        <Route path="/support/privacy-policy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
        <Route path="/support/terms-conditions" element={<Suspense fallback={<PageLoader />}><TermsConditions /></Suspense>} />
        <Route path="/support/cookie-policy" element={<Suspense fallback={<PageLoader />}><CookiePolicy /></Suspense>} />

        {/* 404 Route (keeps main site chrome) */}
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
      </Route>

      {/* Admin Routes - NOT wrapped by main site Layout so only AdminLayout is used */}

  <Route path="/admin" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminReports /></AdminLayout></Suspense></RequireAdmin>} />
  <Route path="/admin/bookings" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminBookings /></AdminLayout></Suspense></RequireAdmin>} />
      <Route path="/admin/users" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminUsers /></AdminLayout></Suspense></RequireAdmin>} />
      <Route path="/admin/destinations" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminDestinations /></AdminLayout></Suspense></RequireAdmin>} />
      <Route path="/admin/reports" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminReports /></AdminLayout></Suspense></RequireAdmin>} />
      <Route path="/admin/profile" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminProfile /></AdminLayout></Suspense></RequireAdmin>} />
  <Route path="/admin/support" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminSupport /></AdminLayout></Suspense></RequireAdmin>} />
      <Route path="/admin/settings" element={<RequireAdmin><Suspense fallback={<PageLoader />}><AdminLayout><AdminSettings /></AdminLayout></Suspense></RequireAdmin>} />
    </Routes>
  );
};

export default AppRoutes;