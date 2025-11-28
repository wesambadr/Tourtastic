import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import api from '@/config/api';
import { Loader2 } from 'lucide-react';

interface IntegrationSettings {
  seeruTravelEnabled: boolean;
}

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<IntegrationSettings>({
    seeruTravelEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get('/admin/settings');
        if (response.data && response.data.data) {
          setSettings(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        toast({
          title: t('error', 'Error'),
          description: t('failedToLoadSettings', 'Failed to load settings'),
          variant: 'destructive',
        });
        // Set default values on error
        setSettings({
          seeruTravelEnabled: true,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [t]);

  const handleToggleSeeruTravel = async (enabled: boolean) => {
    try {
      setSaving(true);
      const response = await api.put('/admin/settings', {
        seeruTravelEnabled: enabled,
      });

      if (response.data && response.data.data) {
        setSettings(response.data.data);
        toast({
          title: t('success', 'Success'),
          description: enabled
            ? t('seeruTravelEnabled', 'Seeru Travel integration enabled')
            : t('seeruTravelDisabled', 'Seeru Travel integration disabled'),
        });
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast({
        title: t('error', 'Error'),
        description: t('failedToUpdateSettings', 'Failed to update settings'),
        variant: 'destructive',
      });
      // Revert the toggle
      setSettings(prev => ({
        ...prev,
        seeruTravelEnabled: !enabled,
      }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-tourtastic-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('settings', 'Settings')}</h1>
        <p className="text-gray-600 mt-2">{t('manageIntegrations', 'Manage integrations and system settings')}</p>
      </div>

      {/* Seeru Travel Integration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('integrations', 'Integrations')}</CardTitle>
          <CardDescription>
            {t('manageExternalServices', 'Manage external service integrations')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seeru Travel Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex-1">
              <Label className="text-base font-semibold cursor-pointer">
                {t('seeruTravelIntegration', 'Seeru Travel Integration')}
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                {t('seeruTravelDescription', 'Enable automatic ticket generation and delivery through Seeru Travel API')}
              </p>
              <div className="mt-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
                {settings.seeruTravelEnabled
                  ? t('seeruTravelEnabledInfo', 'Tickets will be automatically generated and sent to users through Seeru Travel')
                  : t('seeruTravelDisabledInfo', 'Tickets will be stored in admin panel. Manual ticket generation required')}
              </div>
            </div>
            <div className="ml-4">
              <Switch
                checked={settings.seeruTravelEnabled}
                onCheckedChange={handleToggleSeeruTravel}
                disabled={saving}
              />
            </div>
          </div>

          {/* Additional Info */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-semibold text-amber-900 mb-2">
              {t('note', 'Note')}
            </h4>
            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
              <li>
                {t('seeruTravelNote1', 'When enabled: Tickets are generated automatically via Seeru Travel API')}
              </li>
              <li>
                {t('seeruTravelNote2', 'When disabled: Tickets must be manually generated from the admin panel')}
              </li>
              <li>
                {t('seeruTravelNote3', 'Booking data will only be sent to Seeru Travel when integration is enabled')}
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
