import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthenticatedAction } from '../../contexts/useAuthenticatedAction';

const Hero: React.FC = () => {
  const navigate = useNavigate();
  const handleAuthenticatedAction = useAuthenticatedAction();
  const { t } = useTranslation();
  
  return (
    <div className="relative bg-black min-h-[80vh] flex items-center overflow-hidden">
      {/* LCP-optimized hero image: <img> instead of CSS background for better preload/fetchpriority support */}
      <img
        src="/hero-bg.webp"
        alt=""
        width="1920"
        height="1080"
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'brightness(0.6)' }}
      />
      
      {/* Content */}
      <div className="container-custom relative z-10 py-20">
        <div className="max-w-2xl animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            {t('findYourPeace')}
          </h1>
          <p className="text-xl text-gray-200 mb-8">
            {t('discoverWorld')}
          </p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => handleAuthenticatedAction(() => navigate('/destinations'))}
              className="btn-primary">
              {t('findOut')}
            </button>
            <button 
              onClick={() => handleAuthenticatedAction(() => navigate('/flights'))}
              className="bg-white text-tourtastic-dark-blue py-2 px-6 rounded-md hover:bg-gray-100 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50">
              {t('bookNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
