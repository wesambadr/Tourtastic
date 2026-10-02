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
            <div className="flex space-s-4 mt-6 rtl:space-x-reverse gap-3">
              <a href="https://facebook.com/tourtastic" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Facebook size={20} />
              </a>
              <a href="https://instagram.com/tourtastic" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Instagram size={20} />
              </a>
              <a href="https://twitter.com/tourtastic" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Twitter size={20} />
              </a>
              <a href="https://youtube.com/@tourtastic" target="_blank" rel="noopener noreferrer" aria-label="Youtube" className="text-gray-400 hover:text-tourtastic-blue transition-colors">
                <Youtube size={20} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-4">{t('quickLinks', 'Quick Links')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('home', 'Home')}
                </Link>
              </li>
              <li>
                <Link to="/flights" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('flights', 'Flights')}
                </Link>
              </li>
              <li>
                <Link to="/about" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
                  {t('about', 'About Us')}
                </Link>
              </li>
              <li>
                <Link to="/contact" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm">
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
              <li className="flex items-center">
                <Phone size={18} className="mr-2 rtl:ml-2 text-tourtastic-blue flex-shrink-0" />
                <a href="tel:+963098697313" dir="ltr" className="text-gray-300 hover:text-tourtastic-blue transition-colors text-sm font-medium">
                  {t('footerPhone', '+963 098697313')}
                </a>
              </li>
              <li className="flex items-center">
                <Mail size={18} className="mr-2 rtl:ml-2 text-tourtastic-blue flex-shrink-0" />
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
