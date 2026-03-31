import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/assets/logo';
import { MapPin, Phone, Mail, Facebook, Instagram, Twitter, Youtube } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Footer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="bg-gray-900 text-white pt-12 pb-6">
      <div className="container-custom">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo and About */}
          <div>
            <div className="flex items-center">
              <Link to="/" className="block">
                <img 
                  src="/Tourtastic-logo-White.png" 
                  alt="Tourtastic" 
                  width="160"
                  height="160"
                  loading="lazy"
                  className="h-40 mb-2 transition-opacity hover:opacity-90"
                />
              </Link>
            </div>
            <p className="text-sm text-gray-400">{t('tagline', 'Your journey remarkable')}</p>
            <p className="text-gray-300 mt-4 text-sm">
              {t('footerAbout', 'Tourtastic is your premium travel partner, offering exceptional flight booking services to destinations around the world.')}
            </p>
            <div className="flex space-s-4 mt-6 rtl:space-x-reverse">
              <a href="#" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Instagram size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Twitter size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Youtube size={20} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-4">{t('quickLinks', 'Quick Links')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('home', 'Home')}
                </Link>
              </li>
              <li>
                <Link to="/flights" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('flights', 'Flights')}
                </Link>
              </li>
              <li>
                <Link to="/destinations" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('destinations', 'Destinations')}
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('about', 'About Us')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('contact', 'Contact')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-lg font-bold mb-4">{t('support', 'Support')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/support/247-support" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('support', '24/7 Support')}
                </Link>
              </li>
              <li>
                <Link to="/support/help-center" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('helpCenter', 'Help Center')}
                </Link>
              </li>
              <li>
                <Link to="/support/faqs" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('faqs', 'FAQs')}
                </Link>
              </li>
              <li>
                <Link to="/support/booking-policy" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('bookingPolicy', 'Booking Policy')}
                </Link>
              </li>
              <li>
                <Link to="/support/privacy-policy" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('privacyPolicy', 'Privacy Policy')}
                </Link>
              </li>
              <li>
                <Link to="/support/terms-conditions" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('termsConditions', 'Terms & Conditions')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-bold mb-4">{t('contact', 'Contact')}</h3>
            <ul className="space-y-4">
              <li className="flex items-start">
                <MapPin size={18} className="mr-2 text-tourtastic-blue flex-shrink-0 mt-1" />
                <span className="text-gray-300 text-sm">
                  {t('footerAddress', '123 Travel Street, Suite 100\nNew York, NY 10001')}
                </span>
              </li>
              <li className="flex items-center">
                <Phone size={18} className="mr-2 text-tourtastic-blue flex-shrink-0" />
                <a href="tel:+963983697317" dir="ltr" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('footerPhone', '+963 983 697 317')}
                </a>
              </li>
              <li className="flex items-center">
                <Mail size={18} className="mr-2 text-tourtastic-blue flex-shrink-0" />
                <a href="mailto:info@tourtastic.com" dir="ltr" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('footerEmail', 'info@tourtastic.com')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm text-center md:text-start">
              {t('copyright', '© 2025 تورتاستيك. جميع الحقوق محفوظة.')}
            </p>
            <div className="mt-4 md:mt-0">
              <ul className="flex rtl:space-x-reverse space-x-6">
                <li>
                  <Link to="/support/privacy-policy" className="text-gray-400 hover:text-tourtastic-blue transition-colors text-xs">
                    {t('privacyPolicy', 'Privacy Policy')}
                  </Link>
                </li>
                <li>
                  <Link to="/support/terms-conditions" className="text-gray-400 hover:text-tourtastic-blue transition-colors text-xs">
                    {t('termsConditions', 'Terms of Service')}
                  </Link>
                </li>
                <li>
                  <Link to="/support/cookie-policy" className="text-gray-400 hover:text-tourtastic-blue transition-colors text-xs">
                    {t('cookiePolicy', 'Cookie Policy')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
