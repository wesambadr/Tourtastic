import React, { useState, memo, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Bell, Globe, ShoppingBasket, User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useLocale } from '@/hooks/useLocale';
import Logo from '@/assets/logo';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

// Add the Notification interface
interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const Header: React.FC = () => {
  const { t } = useTranslation();
  const { currentLocale, toggleLocale } = useLocale();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const lang = i18n.language.split('-')[0];

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSignOut = () => {
    logout();
    toast({
      title: lang === 'ar' ? 'نجاح' : 'Success',
      description: lang === 'ar' ? 'تم تسجيل الخروج بنجاح' : 'Successfully signed out',
    });
    navigate('/');
  };

  // Fetch unread notifications status - wrapped in useCallback to fix dependency issue
  const fetchUnreadNotifications = useCallback(async () => {
    if (!user) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await axios.get('/api/notifications', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const hasUnread = response.data.data.some((notification: Notification) => !notification.read);
      setHasUnreadNotifications(hasUnread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUnreadNotifications();
      // Set up polling every minute to check for new notifications
      const interval = setInterval(fetchUnreadNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [user, fetchUnreadNotifications]);

  return (
    <header className="bg-white shadow-md fixed w-full top-0 left-0 z-50">
      <div className="container-custom mx-auto py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <Logo />
        </Link>

        {/* Mobile menu button */}
        <div className="md:hidden">
          <button
            onClick={toggleMenu}
            className="text-gray-800 hover:text-tourtastic-blue focus:outline-none"
          >
            {isMenuOpen ? (
              <X size={24} />
            ) : (
              <Menu size={24} />
            )}
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'nav-link-active' : ''}`} end>
            {t('home')}
          </NavLink>
          <NavLink to="/flights" className={({isActive}) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            {t('flights')}
          </NavLink>
          <NavLink to="/destinations" className={({isActive}) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            {t('destinations')}
          </NavLink>
          <NavLink to="/about" className={({isActive}) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            {t('about')}
          </NavLink>
          <NavLink to="/contact" className={({isActive}) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            {t('contact')}
          </NavLink>
        </nav>

        {/* Auth Buttons & Utilities Desktop */}
        <div className="hidden md:flex items-center space-x-4">
          {user ? (
            <>
              {/* Notifications */}
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-600 hover:text-tourtastic-blue relative"
                asChild
              >
                <Link to="/notifications">
                  <Bell className="h-5 w-5" />
                  {hasUnreadNotifications && (
                    <span className="absolute -top-1 -right-1 block h-2 w-2 rounded-full bg-tourtastic-blue ring-2 ring-white" />
                  )}
                  <span className="sr-only">{t('notifications')}</span>
                </Link>
              </Button>

              {/* User Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-gray-600 hover:text-tourtastic-blue">
                    <User className="h-5 w-5" />
                    <span className="sr-only">{t('profile')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="w-full cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      {t('myAccount')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={toggleLocale} className="cursor-pointer">
                    <Globe className="mr-2 h-4 w-4" />
                    {currentLocale === 'en' ? 'EN' : 'AR'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              {/* Language Toggle */}
              <Button 
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-tourtastic-blue"
                onClick={toggleLocale}
              >
                <Globe className="h-5 w-5" />
                <span className="ml-2">{currentLocale === 'en' ? 'EN' : 'AR'}</span>
              </Button>

              {/* Sign In Button */}
              <Button
                variant="ghost"
                className="text-tourtastic-blue hover:text-tourtastic-dark-blue transition-colors"
                asChild
              >
                <Link to="/login">
                  {t('signIn')}
                </Link>
              </Button>

              {/* Register Button */}
              <Button
                className="bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white"
                asChild
              >
                <Link to="/register">
                  {t('register')}
                </Link>
              </Button>
            </>
          )}
          
          {/* Shopping Cart - Always Visible */}
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-600 hover:text-tourtastic-blue relative"
            asChild
          >
            <Link to="/cart">
              <ShoppingBasket className="h-5 w-5" />
              <span className="sr-only">{t('cart')}</span>
            </Link>
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white shadow-md animate-fade-in">
            <div className="container mx-auto py-3 flex flex-col">
              <NavLink 
                to="/" 
                className={({isActive}) => `py-2 px-4 ${isActive ? 'text-tourtastic-blue font-semibold' : 'text-gray-800'}`}
                onClick={toggleMenu}
                end
              >
                {t('home')}
              </NavLink>
              <NavLink 
                to="/flights" 
                className={({isActive}) => `py-2 px-4 ${isActive ? 'text-tourtastic-blue font-semibold' : 'text-gray-800'}`}
                onClick={toggleMenu}
              >
                {t('flights')}
              </NavLink>
              <NavLink 
                to="/destinations" 
                className={({isActive}) => `py-2 px-4 ${isActive ? 'text-tourtastic-blue font-semibold' : 'text-gray-800'}`}
                onClick={toggleMenu}
              >
                {t('destinations')}
              </NavLink>
              <NavLink 
                to="/about" 
                className={({isActive}) => `py-2 px-4 ${isActive ? 'text-tourtastic-blue font-semibold' : 'text-gray-800'}`}
                onClick={toggleMenu}
              >
                {t('about')}
              </NavLink>
              <NavLink 
                to="/contact" 
                className={({isActive}) => `py-2 px-4 ${isActive ? 'text-tourtastic-blue font-semibold' : 'text-gray-800'}`}
                onClick={toggleMenu}
              >
                {t('contact')}
              </NavLink>
              
              {/* Mobile Auth Buttons */}
              {user ? (
                <>
                  <Link 
                    to="/notifications" 
                    className="py-2 px-4 text-gray-800 flex items-center relative"
                    onClick={toggleMenu}
                  >
                    <Bell className="h-5 w-5 mr-2" />
                    {t('notifications.title')}
                    {hasUnreadNotifications && (
                      <span className="absolute top-2 right-4 block h-2 w-2 rounded-full bg-tourtastic-blue" />
                    )}
                  </Link>
                  <Link 
                    to="/profile" 
                    className="py-2 px-4 text-gray-800 flex items-center"
                    onClick={toggleMenu}
                  >
                    <User className="h-5 w-5 mr-2" />
                    {t('myAccount')}
                  </Link>
                  <button 
                    onClick={() => {
                      handleSignOut();
                      toggleMenu();
                    }}
                    className="py-2 px-4 text-red-600 flex items-center"
                  >
                    <LogOut className="h-5 w-5 mr-2" />
                    {t('signOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/login" 
                    className="py-2 px-4 text-tourtastic-blue"
                    onClick={toggleMenu}
                  >
                    {t('signIn')}
                  </Link>
                  <Link 
                    to="/register" 
                    className="py-2 px-4 bg-tourtastic-blue text-white rounded-md"
                    onClick={toggleMenu}
                  >
                    {t('register')}
                  </Link>
                </>
              )}
              
              {/* Language Toggle for Mobile */}
              <button
                onClick={() => {
                  toggleLocale();
                  toggleMenu();
                }}
                className="py-2 px-4 text-gray-800 flex items-center w-full"
              >
                <Globe className="h-5 w-5 mr-2" />
                {currentLocale === 'en' ? 'EN' : 'AR'}
              </button>

              {/* Mobile Cart - Always Visible */}
              <Link 
                to="/cart" 
                className="py-2 px-4 text-gray-800 flex items-center"
                onClick={toggleMenu}
              >
                <ShoppingBasket className="h-5 w-5 mr-2" />
                {t('cart')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default memo(Header);
