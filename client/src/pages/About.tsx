import React from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

const About: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 py-12">
        <div className="container-custom">
          <h1 className="text-4xl font-bold mb-4">{t('aboutUs', 'About Us')}</h1>
          <p className="text-gray-600 max-w-2xl">
            {t('aboutIntro', "Learn more about Tourtastic and our mission to create unforgettable travel experiences.")}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-12 container-custom">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column - Company Story */}
          <div className="animate-fade-in space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-4 section-title">{t('ourStory', 'Our Story')}</h2>
              <p className="text-gray-600 mb-4">
                {t('aboutStory1', 'Founded in 2018, Tourtastic was born from a simple idea: travel should be fantastic for everyone. Our founders, avid travelers themselves, had experienced the frustrations of planning trips, navigating foreign cities, and dealing with the unexpected challenges that come with exploration.')}
              </p>
              <p className="text-gray-600">
                {t('aboutStory2', "What started as a small team of passionate travelers has grown into a global company serving thousands of customers across 60+ countries. We've built our reputation on personalized service, authentic experiences, and a commitment to responsible tourism.")}
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4 section-title">{t('ourMission', 'Our Mission')}</h2>
              <p className="text-gray-600">
                {t('aboutMission', "At Tourtastic, we believe that travel has the power to transform lives, broaden perspectives, and create meaningful connections across cultures. Our mission is to make exceptional travel experiences accessible to everyone through innovative technology, outstanding customer service, and deep local partnerships.")}
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4 section-title">{t('ourValues', 'Our Values')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="card-shadow">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-2">{t('authenticity', 'Authenticity')}</h3>
                    <p className="text-gray-600">
                      {t('aboutAuthenticity', 'We create genuine experiences that respect local cultures and traditions.')}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="card-shadow">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-2">{t('sustainability', 'Sustainability')}</h3>
                    <p className="text-gray-600">
                      {t('aboutSustainability', "We're committed to environmentally responsible travel practices.")}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="card-shadow">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-2">{t('innovation', 'Innovation')}</h3>
                    <p className="text-gray-600">
                      {t('aboutInnovation', 'We continuously improve our technology to enhance the travel experience.')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Right Column - Team & Image */}
          <div className="space-y-8 animate-fade-in animation-delay-200">
            <div className="rounded-lg overflow-hidden mb-8">
              {/* CLS fix: explicit width/height, lazy loading for below-fold image */}
              <img 
                src="/about-team.webp" 
                alt={t('tourteamPhoto', 'فريق تورتاستيك')} 
                width="800"
                height="600"
                loading="lazy"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default About;
