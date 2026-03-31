import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAllDestinations, Destination } from '@/services/destinationService';

const ProductManagement: React.FC = () => {
  const { i18n } = useTranslation();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAllDestinations();
        setDestinations(data);
      } catch (err) {
        console.error('Failed to load destinations', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const lang = (i18n?.language || 'en').split('-')[0] as 'en' | 'ar';

  const getLocalized = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      const pick = (k: string) => {
        const val = v[k];
        return typeof val === 'string' ? val : undefined;
      };
      return pick(lang) ?? pick('en') ?? pick('ar') ?? '';
    }
    return '';
  };

  const readLocalizedList = (value: unknown): string[] => {
    if (!value) return [];
    // object with en/ar arrays
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const arr = v[lang];
      if (Array.isArray(arr)) return (arr as unknown[]).map(it => String(it ?? '')).filter(Boolean);
      if (typeof arr === 'string') return [arr];
    }
    if (Array.isArray(value)) {
      return (value as unknown[]).map(item => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const it = item as Record<string, unknown>;
          const pick = (k: string) => (typeof it[k] === 'string' ? (it[k] as string) : undefined);
          return pick(lang) ?? pick('en') ?? pick('ar') ?? '';
        }
        return '';
      }).filter(Boolean);
    }
    return [];
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Product Management</h1>
      <p className="text-sm text-muted-foreground mb-6">Current language: {lang.toUpperCase()}</p>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {destinations.map(dest => (
            <div key={dest._id} className="p-4 border rounded-md shadow-sm">
              <div className="flex gap-4">
                {/* CLS fix: explicit width/height */}
                <img src={dest.image || '/placeholder.svg'} alt={getLocalized(dest.name)} width="112" height="80" loading="lazy" className="w-28 h-20 object-cover rounded" />
                <div>
                  <h2 className="text-lg font-semibold">{getLocalized(dest.name)}</h2>
                  <div className="text-sm text-muted-foreground">{getLocalized(dest.country)}</div>
                  <p className="mt-2 text-sm">{getLocalized(dest.description)}</p>
                  <div className="mt-2 text-sm">
                    <strong>Top Attractions:</strong> {readLocalizedList(dest.topAttractions).join(', ')}
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>Local Cuisine:</strong> {readLocalizedList(dest.localCuisine).join(', ')}
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>Shopping:</strong> {readLocalizedList(dest.shopping).join(', ')}
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>Best Time To Visit:</strong> {getLocalized(dest.bestTimeToVisit)}
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>Airport / Time Zone:</strong> {dest.quickInfo?.airport || ''} / {dest.quickInfo?.timeZone || ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
