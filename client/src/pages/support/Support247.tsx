import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Mail, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const Support247: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="container-custom py-12">
      <h1 className="text-3xl font-bold text-center mb-8">
        {t('247Support', '24/7 Customer Support')}
      </h1>
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-600 text-center mb-12">
          {t('247SupportDesc', 'Our dedicated support team is available around the clock to assist you with any inquiries or concerns you may have.')}
        </p>
        
        <div className="grid gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="bg-tourtastic-light-blue p-3 rounded-full">
                  <Phone className="h-6 w-6 text-tourtastic-blue" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-2">{t('phoneSupport', 'Phone Support')}</h3>
                  <p className="text-gray-600 mb-2">{t('phoneSupportDesc', 'Speak directly with our support team')}</p>
                  <a href="tel:+963098697313" dir="ltr" className="text-tourtastic-blue hover:underline font-semibold">
                    +963 098697313
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="bg-tourtastic-light-blue p-3 rounded-full">
                  <Mail className="h-6 w-6 text-tourtastic-blue" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-2">{t('emailSupport', 'Email Support')}</h3>
                  <p className="text-gray-600 mb-2">{t('emailSupportDesc', 'Send us an email anytime')}</p>
                  <a href="mailto:support@tourtastic.com" className="text-tourtastic-blue hover:underline">
                    support@tourtastic.com
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Support247;
