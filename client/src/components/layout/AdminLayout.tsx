import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess } from '@/utils/i18nToast';
import Logo from '@/assets/logo';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Ticket,
  Users,
  MapPin,
  BarChart2,
  LogOut,
  User,
  HelpCircle,
  Globe,
  Menu as MenuIcon,
  X as CloseIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/hooks/useLocale';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { currentLocale, toggleLocale } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // for mobile drawer
  const lang = i18n.language.split('-')[0];
  
  const navigation = [
    { name: t('bookings'), href: '/admin/bookings', icon: <Ticket className="h-5 w-5" /> },
    { name: t('users'), href: '/admin/users', icon: <Users className="h-5 w-5" /> },
    { name: t('admin.support.title'), href: '/admin/support', icon: <HelpCircle className="h-5 w-5" /> },
    { name: t('destinations'), href: '/admin/destinations', icon: <MapPin className="h-5 w-5" /> },
    { name: t('reports'), href: '/admin/reports', icon: <BarChart2 className="h-5 w-5" /> },
    { name: t('settings'), href: '/admin/settings', icon: <SettingsIcon className="h-5 w-5" /> },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogout = () => {
    logout();
    toastSuccess('تم تسجيل الخروج بنجاح', 'Logged out successfully');
    navigate('/login');
  };

  // Sidebar content as a component for reuse
  const SidebarContent = (
    <>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between p-4 border-b h-16">
        {!collapsed && (
            <Logo />
        )}
        <div className="hidden md:flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>
  {/* (mobile) close button only - globe moved to profile area */}
        {/* Close button for mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <CloseIcon />
        </Button>
      </div>
      {/* Sidebar Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => (
          <Link 
            key={item.href} 
            to={item.href}
            className={cn(
              "flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors",
              isActive(item.href) && "bg-tourtastic-light-blue text-tourtastic-blue font-medium",
              collapsed && "justify-center"
            )}
            onClick={() => setSidebarOpen(false)} // close drawer on nav click
          >
            <span>{item.icon}</span>
            {!collapsed && <span>{item.name}</span>}
          </Link>
        ))}
      </nav>
      {/* User Profile */}
      <div className="p-4 border-t">
        {!collapsed && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4 text-current" />
                <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}</span>
              </button>
              {/* Translation toggle placed next to logout for easy access */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleLocale()}
                title={currentLocale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
                className="text-gray-600 hover:text-gray-900"
              >
                <Globe className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar for desktop */}
      <aside
        className={cn(
          "hidden md:fixed md:inset-y-0 md:left-0 md:z-10 md:flex md:flex-col bg-white border-r shadow-sm transition-all duration-300",
          collapsed ? "md:w-20" : "md:w-64"
        )}
      >
        {SidebarContent}
      </aside>
      {/* Sidebar Drawer for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 flex md:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-40" onClick={() => setSidebarOpen(false)}></div>
          <aside className="relative w-64 max-w-full h-full bg-white shadow-lg z-40 animate-slide-in-left">
            {SidebarContent}
          </aside>
        </div>
      )}
      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 min-w-0",
          collapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        {/* Header */}
        <header className="bg-white h-16 border-b flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon />
          </Button>
          <h1 className="text-lg md:text-xl font-bold truncate">{t('adminPortal')}</h1>
        </header>
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
