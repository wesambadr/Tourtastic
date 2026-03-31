import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Destination, getAllDestinations, getDestination, updateDestination, updateDestinationPopular, createDestination, deleteDestination } from '@/services/destinationService';

// Airport is stored as a single string code

// Destination form schema
// Form schema uses strings for individual localized fields and other simple values
const destinationSchema = z.object({
  name_en: z.string().min(1, { message: "English name is required" }),
  name_ar: z.string().min(1, { message: "Arabic name is required" }),
  country_en: z.string().min(1, { message: "English country is required" }),
  country_ar: z.string().min(1, { message: "Arabic country is required" }),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  time_zone: z.string().optional(),
  airport_code: z.string().optional(),
  // number of days used when searching flights for this destination
  search_window_days: z.string().refine(val => val === undefined || (/^\d+$/.test(val) && parseInt(val) >= 1 && parseInt(val) <= 365), {
    message: 'Search window must be a whole number between 1 and 365',
  }).optional(),
  rating: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 5, {
    message: "Rating must be a number between 0 and 5",
  }),
  // image will be uploaded from device; store URL on server, no client URL input required
  image: z.string().optional(),
  popular: z.boolean().default(false),
  top_attractions_en: z.array(z.string()).optional().default([]),
  top_attractions_ar: z.array(z.string()).optional().default([]),
  local_cuisine_en: z.array(z.string()).optional().default([]),
  local_cuisine_ar: z.array(z.string()).optional().default([]),
  shopping_en: z.array(z.string()).optional().default([]),
  shopping_ar: z.array(z.string()).optional().default([]),
  best_time_to_visit_en: z.string().optional().default(''),
  best_time_to_visit_ar: z.string().optional().default(''),
});

type DestinationFormValues = z.infer<typeof destinationSchema>;

const AdminDestinations = () => {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editDestination, setEditDestination] = useState<Destination | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<DestinationFormValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: {
      name_en: '',
      name_ar: '',
      country_en: '',
      country_ar: '',
      description_en: '',
      description_ar: '',
      airport_code: '',
      rating: '',
      image: '',
  search_window_days: '30',
    },
  });

  const { i18n, t } = useTranslation();

  // helper to get localized string from LocalizedString or plain string
  const getLocalizedString = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const dict = value as Record<string, string>;
      const lang = (i18n?.language || 'en').split('-')[0];
      return dict[lang] || dict['en'] || Object.values(dict)[0] || '';
    }
    return '';
  };

  useEffect(() => {
    fetchDestinations();
  }, []);

  // Helpers to safely normalize server shapes for localized lists.
  const toArrayOfItems = (value: unknown): unknown[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value !== null) {
      // Don't assume en first here; caller should pick the correct language when appropriate.
      // If value is an object that contains arrays for en/ar, return it so the caller can choose.
      return [value];
    }
    return [value];
  };

  const extractLocalizedList = (value: unknown, lang: 'en' | 'ar'): string[] => {
    if (!value) return [];
    // If server stored an object with arrays { en: [...], ar: [...] }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (Array.isArray(v[lang])) {
        return (v[lang] as unknown[]).map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null) {
            const itm = item as Record<string, unknown>;
            const maybe = itm[lang] ?? itm.en ?? itm.ar ?? '';
            return typeof maybe === 'string' ? maybe : '';
          }
          return '';
        });
      }
      // If caller gave us a single object with en/ar strings, return that single localized value
      if (typeof v[lang] === 'string' || typeof v.en === 'string' || typeof v.ar === 'string') {
        const resolved = (v[lang] as string) || (v.en as string) || (v.ar as string) || '';
        return resolved ? [resolved] : [];
      }
    }

    // Otherwise, treat value as an array of items (strings or {en,ar})
    const list = toArrayOfItems(value);
    return list.map(item => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const it = item as Record<string, unknown>;
        const maybe = (it[lang] as unknown) ?? it.en ?? it.ar ?? '';
        return typeof maybe === 'string' ? maybe : '';
      }
      return '';
    });
  };

  // More robust reader that handles multiple shapes: {en:[], ar:[]}, [{en,ar}], ['str']
  const readLocalizedList = (value: unknown, lang: 'en' | 'ar'): string[] => {
    if (!value) return [];
    // If value is an object with en/ar arrays
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if (Array.isArray(v[lang])) return (v[lang] as unknown[]).map(item => String(item || ''));
      // If en/ar are strings (single value), return single element
      if (typeof v[lang] === 'string') return [v[lang] as string];
    }

    // If it's an array
    if (Array.isArray(value)) {
      if (value.length === 0) return [];
      // array of strings
      if (typeof value[0] === 'string') return (value as string[]).map(s => String(s));
      // array of objects {en, ar}
      return (value as unknown[]).map(item => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const it = item as Record<string, unknown>;
          const maybe = it[lang] ?? it.en ?? it.ar ?? '';
          return typeof maybe === 'string' ? maybe : '';
        }
        return '';
      });
    }

    // Fallback to using extractLocalizedList logic
    return extractLocalizedList(value, lang);
  };

  const toEnArArrays = (value: unknown): { en: string[]; ar: string[] } => {
    const list = toArrayOfItems(value);
    const en: string[] = [];
    const ar: string[] = [];
    for (const item of list) {
      if (!item) {
        en.push('');
        ar.push('');
        continue;
      }
      if (typeof item === 'string') {
        en.push(item);
        ar.push('');
        continue;
      }
      if (typeof item === 'object' && item !== null) {
        const it = item as Record<string, unknown>;
        en.push(typeof it.en === 'string' ? it.en : '');
        ar.push(typeof it.ar === 'string' ? it.ar : '');
        continue;
      }
      en.push('');
      ar.push('');
    }
    return { en, ar };
  };

  const normalizeAirport = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      return typeof v.code === 'string' ? v.code : (typeof v.en === 'string' ? v.en : '');
    }
    return '';
  };

  const fetchDestinations = async () => {
    try {
      const data = await getAllDestinations();
      setDestinations(data);
    } catch (error) {
      console.error('Error fetching destinations:', error);
      const lang = i18n.language.split('-')[0];
      toast.error(lang === 'ar' ? 'فشل تحميل الوجهات' : 'Failed to load destinations');
    }
  };

  // Open dialog for adding a new destination with empty defaults
  const handleAddClick = () => {
    setEditDestination(null);
  // Clear any previously selected local file so preview shows stored image (if any)
  setImageFile(null);
    form.reset({
      name_en: '',
      name_ar: '',
      country_en: '',
      country_ar: '',
      description_en: '',
      description_ar: '',
      airport_code: '',
      rating: '',
      image: '',
      popular: false,
      top_attractions_en: [],
      top_attractions_ar: [],
      local_cuisine_en: [],
      local_cuisine_ar: [],
      shopping_en: [],
      shopping_ar: [],
      best_time_to_visit_en: '',
      best_time_to_visit_ar: '',
      time_zone: '',
  search_window_days: '30',
    });
    setIsAddDialogOpen(true);
  };

  // Populate form and open dialog when editing a destination
  const handleEdit = (destination: Destination) => {
    setEditDestination(destination);
  // Clear any previously selected local file so we show this destination's image
  setImageFile(null);

  const airport = destination.quickInfo?.airport as string | undefined;
    const timeZone = destination.quickInfo?.timeZone as string | { en?: string; ar?: string } | undefined;

    const values: DestinationFormValues = {
      name_en: destination.name?.en || '',
      name_ar: destination.name?.ar || '',
      country_en: destination.country?.en || '',
      country_ar: destination.country?.ar || '',
      description_en: destination.description?.en || '',
      description_ar: destination.description?.ar || '',
      rating: destination.rating != null ? String(destination.rating) : '',
      image: destination.image || '',
      popular: !!destination.popular,
  airport_code: normalizeAirport(airport),
      time_zone: (() => {
        if (!timeZone) return '';
        return typeof timeZone === 'string' ? timeZone : (timeZone.en || timeZone.ar || '');
      })(),
  top_attractions_en: readLocalizedList((destination as unknown as Record<string, unknown>).topAttractions, 'en'),
  top_attractions_ar: readLocalizedList((destination as unknown as Record<string, unknown>).topAttractions, 'ar'),
  local_cuisine_en: readLocalizedList((destination as unknown as Record<string, unknown>).localCuisine, 'en'),
  local_cuisine_ar: readLocalizedList((destination as unknown as Record<string, unknown>).localCuisine, 'ar'),
  shopping_en: readLocalizedList((destination as unknown as Record<string, unknown>).shopping, 'en'),
  shopping_ar: readLocalizedList((destination as unknown as Record<string, unknown>).shopping, 'ar'),
      best_time_to_visit_en: destination.bestTimeToVisit?.en || '',
      best_time_to_visit_ar: destination.bestTimeToVisit?.ar || '',
  search_window_days: (destination as any).searchWindowDays != null ? String((destination as any).searchWindowDays) : '30',
    };

    // Reset form with fetched values and open dialog
    form.reset(values);
    setIsAddDialogOpen(true);
  };

  // Toggle popular flag quickly from table without opening edit dialog
  const togglePopular = async (id: string) => {
    const original = destinations.find(d => d._id === id);
    if (!original) return;
    const newValue = !original.popular;

    // Optimistic UI update
    setDestinations(prev => prev.map(d => d._id === id ? { ...d, popular: newValue } : d));

    try {
      await updateDestinationPopular(id, newValue);
      const lang = i18n.language.split('-')[0];
      const message = newValue 
        ? (lang === 'ar' ? 'تم وضع علامة شائع' : 'Destination marked as popular')
        : (lang === 'ar' ? 'تم إزالة علامة شائع' : 'Destination unmarked as popular');
      toast.success(message);
    } catch (err) {
      // Revert on error
      setDestinations(prev => prev.map(d => d._id === id ? { ...d, popular: original.popular } : d));
      console.error('Failed to toggle popular:', err);
      const lang = i18n.language.split('-')[0];
      toast.error(lang === 'ar' ? 'فشل تحديث حالة الشعبية' : 'Failed to update popular status');
    }
  };

  // Delete a destination with confirmation
  const handleDelete = async (id: string) => {
    const lang = i18n.language.split('-')[0];
    const confirmMsg = lang === 'ar' 
      ? 'هل أنت متأكد من حذف هذه الوجهة؟ لا يمكن التراجع عن هذا الإجراء.'
      : 'Are you sure you want to delete this destination? This action cannot be undone.';
    
    const ok = window.confirm(confirmMsg);
    if (!ok) return;
    
    const original = destinations;
    // Optimistic UI: remove immediately
    setDestinations(prev => prev.filter(d => d._id !== id));
    try {
      await deleteDestination(id);
      toast.success(lang === 'ar' ? 'تم حذف الوجهة بنجاح' : 'Destination deleted successfully');
    } catch (err) {
      // Revert on error
      setDestinations(original);
      console.error('Failed to delete destination:', err);
      toast.error(lang === 'ar' ? 'فشل حذف الوجهة' : 'Failed to delete destination');
    }
  };

  // Handle form submission
  const onSubmit = async (data: DestinationFormValues) => {
    // Prevent double submission
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    const lang = i18n.language.split('-')[0];
    
    try {
      if (editDestination) {
        // Build payload matching server model: nested localized fields
        // map arrays into localized objects
        const mapLocalizedList = (enList: string[] = [], arList: string[] = []) => {
          const maxLen = Math.max(enList.length, arList.length);
          const out: { en: string; ar: string }[] = [];
          for (let i = 0; i < maxLen; i++) {
            out.push({ en: enList[i] || '', ar: arList[i] || '' });
          }
          return out;
        };

  const payload: any = {
          name: { en: data.name_en, ar: data.name_ar },
          country: { en: data.country_en, ar: data.country_ar },
          description: { en: data.description_en || '', ar: data.description_ar || '' },
          rating: data.rating ? parseFloat(data.rating) : (editDestination.rating ?? 0),
          image: data.image || editDestination.image,
          popular: Boolean(data.popular),
          topAttractions: mapLocalizedList(data.top_attractions_en || [], data.top_attractions_ar || []),
          localCuisine: mapLocalizedList(data.local_cuisine_en || [], data.local_cuisine_ar || []),
          shopping: mapLocalizedList(data.shopping_en || [], data.shopping_ar || []),
          bestTimeToVisit: { en: data.best_time_to_visit_en || '', ar: data.best_time_to_visit_ar || '' },
          quickInfo: {
            // use single string timeZone and single airport code only
            timeZone: (() => {
              if (data.time_zone) return data.time_zone;
              const existingTz = editDestination.quickInfo?.timeZone;
              if (!existingTz) return '';
              if (typeof existingTz === 'string') return existingTz;
              const tzObj = existingTz as { en?: string; ar?: string };
              return tzObj.en || tzObj.ar || '';
            })(),
            airport: (() => {
              if (data.airport_code) return data.airport_code;
              const existing = editDestination.quickInfo?.airport;
              return normalizeAirport(existing);
            })()
          }
          ,
          // include search window days for flight searches (stored as number on server)
          searchWindowDays: data.search_window_days ? parseInt(data.search_window_days) : ((editDestination as any)?.searchWindowDays ?? 30),
        };

        // If user selected a local file in the input (we store it in state below), send FormData
        if ((imageFile as File | null) && imageFile instanceof File) {
          const formData = new FormData();
          // append JSON fields as a single 'payload' field so server can parse nested objects
          // We'll append the structured fields individually
          formData.append('name', JSON.stringify(payload.name));
          formData.append('country', JSON.stringify(payload.country));
          formData.append('description', JSON.stringify(payload.description));
          formData.append('rating', String(payload.rating));
          formData.append('popular', String(payload.popular));
          // send lists as { en: [], ar: [] } to match server schema
          const taArrays = toEnArArrays(payload.topAttractions || []);
          const lcArrays = toEnArArrays(payload.localCuisine || []);
          const shArrays = toEnArArrays(payload.shopping || []);
          formData.append('topAttractions', JSON.stringify(taArrays));
          formData.append('localCuisine', JSON.stringify(lcArrays));
          formData.append('shopping', JSON.stringify(shArrays));
          formData.append('bestTimeToVisit', JSON.stringify(payload.bestTimeToVisit));
          // quickInfo fields
          formData.append('quickInfo[timeZone]', String(payload.quickInfo?.timeZone || ''));
          formData.append('quickInfo[airport]', String(payload.quickInfo?.airport || ''));
          formData.append('searchWindowDays', String(data.search_window_days || ((editDestination as any)?.searchWindowDays ?? 30)));
          formData.append('destinationImage', imageFile as File);

          await updateDestination(editDestination._id, formData as unknown as Partial<Destination>);
        } else {
          await updateDestination(editDestination._id, payload);
        }
        await fetchDestinations();
        toast.success(lang === 'ar' ? 'تم تحديث الوجهة بنجاح!' : 'Destination updated successfully!');
      }
      else {
        // Create new destination (use FormData because we require an uploaded image)
        const formData = new FormData();
        formData.append('name', JSON.stringify({ en: data.name_en, ar: data.name_ar }));
        formData.append('country', JSON.stringify({ en: data.country_en, ar: data.country_ar }));
        formData.append('description', JSON.stringify({ en: data.description_en || '', ar: data.description_ar || '' }));
        formData.append('rating', String(data.rating ? parseFloat(data.rating) : 0));
        formData.append('popular', String(Boolean(data.popular)));
  // send lists as { en: [], ar: [] } to match server schema
  formData.append('topAttractions', JSON.stringify({ en: (data.top_attractions_en || []), ar: (data.top_attractions_ar || []) }));
  formData.append('localCuisine', JSON.stringify({ en: (data.local_cuisine_en || []), ar: (data.local_cuisine_ar || []) }));
  formData.append('shopping', JSON.stringify({ en: (data.shopping_en || []), ar: (data.shopping_ar || []) }));
        formData.append('bestTimeToVisit', JSON.stringify({ en: data.best_time_to_visit_en || '', ar: data.best_time_to_visit_ar || '' }));
        formData.append('quickInfo[timeZone]', String(data.time_zone || ''));
        formData.append('quickInfo[airport]', String(data.airport_code || ''));
  formData.append('searchWindowDays', String(data.search_window_days || 30));
  if (imageFile) formData.append('destinationImage', imageFile);

        await createDestination(formData);
        await fetchDestinations();
        toast.success(lang === 'ar' ? 'تم إنشاء الوجهة بنجاح!' : 'Destination created successfully!');
      }
      // Reset form and close dialog
      form.reset();
      setIsAddDialogOpen(false);
      setEditDestination(null);
      setImageFile(null);
    } catch (error) {
      console.error('Error saving destination:', error);
      const errorMsg = editDestination
        ? (lang === 'ar' ? 'فشل تحديث الوجهة' : 'Failed to update destination')
        : (lang === 'ar' ? 'فشل إنشاء الوجهة' : 'Failed to create destination');
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle dialog close
  const handleDialogClose = () => {
    form.reset();
    setIsAddDialogOpen(false);
    setEditDestination(null);
  // Clear file input preview when closing
  setImageFile(null);
  };

  // Filter destinations based on search query
  const filteredDestinations = destinations.filter(destination => {
    const name = getLocalizedString(destination.name).toLowerCase();
    const country = getLocalizedString(destination.country).toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || country.includes(q);
  });

  return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('destinationsManagement', { defaultValue: 'Destinations Management' })}</h1>
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder={t('searchDestinations...', { defaultValue: 'Search destinations...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <Button onClick={handleAddClick} size="sm">{t('addDestination', { defaultValue: 'Add Destination' })}</Button>
           </div>
        </div>

        <Card>
            <CardHeader className="pb-0">
            <CardTitle className="flex text-xl justify-center">{t('destinationsList', { defaultValue: 'Destinations List' })}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('image', { defaultValue: 'Image' })}</TableHead>
                  <TableHead>{t('name', { defaultValue: 'Name' })}</TableHead>
                  <TableHead>{t('country', { defaultValue: 'Country' })}</TableHead>
                  <TableHead>{t('rating', { defaultValue: 'Rating' })}</TableHead>
                  <TableHead>{t('popular', { defaultValue: 'Popular' })}</TableHead>
                  <TableHead>{t('actions', { defaultValue: 'Actions' })}</TableHead>
                </TableRow>
               </TableHeader>
               <TableBody>
                {filteredDestinations.map((destination) => (
                  <TableRow key={destination._id}>
                    <TableCell>
                      {/* CLS fix: explicit width/height */}
                      <img
                        src={destination.image || '/placeholder.svg'}
                        alt={getLocalizedString(destination.name)}
                        width="48"
                        height="48"
                        loading="lazy"
                        className="w-12 h-12 rounded-md object-cover"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="break-words">{getLocalizedString(destination.name)}</div>
                    </TableCell>
                    <TableCell>{getLocalizedString(destination.country)}</TableCell>
                    <TableCell>{destination.rating ?? '-'}</TableCell>
                    <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => togglePopular(destination._id)}>
                        {destination.popular ? `★ ${t('popular', { defaultValue: 'Popular' })}` : `☆ ${t('mark', { defaultValue: 'Mark' })}`}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEdit(destination)}>{t('modify', { defaultValue: 'Modify' })}</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(destination._id)}>{t('delete', { defaultValue: 'Delete' })}</Button>
                        {/* other actions like Delete can go here */}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
               </TableBody>
             </Table>
           </CardContent>
         </Card>

         

         <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-h-[70vh] w-full sm:max-w-lg overflow-auto">
                  <DialogHeader>
                <DialogTitle>
                  {editDestination ? t('editDestination', { defaultValue: 'Edit Destination' }) : t('addNewDestination', { defaultValue: 'Add New Destination' })}
                </DialogTitle>
                <DialogDescription>
                  {editDestination ? t('editDestinationDescription', { defaultValue: 'Edit the destination details below. Fields marked required must be filled.' }) : t('addDestinationDescription', { defaultValue: 'Fill the fields below to add a new destination. Provide English and Arabic values for searchable fields.' })}
                </DialogDescription>
              </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                
                {/* Localized name fields */}
                <FormField
                  control={form.control}
                  name="name_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('destinationNameEnglish', { defaultValue: 'Destination Name (English)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Paris" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('destinationNameArabic', { defaultValue: 'Destination Name (Arabic)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: باريس" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Localized country fields */}
                <FormField
                  control={form.control}
                  name="country_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('countryEnglish', { defaultValue: 'Country (English)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., France" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('countryArabic', { defaultValue: 'Country (Arabic)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: فرنسا" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Localized description fields */}
                <FormField
                  control={form.control}
                  name="description_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('descriptionEnglish', { defaultValue: 'Description (English)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="Short description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('descriptionArabic', { defaultValue: 'Description (Arabic)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="وصف قصير" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ratingRange', { defaultValue: 'Rating (0-5)' })}</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" max="5" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormItem>
                  <FormLabel>{t('uploadImage', { defaultValue: 'Upload Image' })}</FormLabel>
                  <FormControl>
                    <input type="file" accept="image/*" onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      setImageFile(f || null);
                    }} />
                  </FormControl>
                  {/* CLS fix: explicit width/height */}
                  {imageFile ? (
                    <img src={URL.createObjectURL(imageFile)} alt="preview" width="96" height="96" loading="lazy" className="mt-2 w-24 h-24 object-cover rounded" />
                  ) : (form.getValues('image') || editDestination?.image) ? (
                    <img src={(form.getValues('image') as string) || editDestination?.image} alt="preview" width="96" height="96" loading="lazy" className="mt-2 w-24 h-24 object-cover rounded" />
                  ) : null}
                </FormItem>

                {/* Airport fields used for search/quickInfo */}
                <FormField
                  control={form.control}
                  name="airport_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('airportCode', { defaultValue: 'Airport Code' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., LHR" value={field.value as string} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Localized lists (comma-separated editing) */}
                <FormField
                  control={form.control}
                  name="top_attractions_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('topAttractionsEnglish', { defaultValue: 'Top Attractions (English) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="top_attractions_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('topAttractionsArabic', { defaultValue: 'Top Attractions (Arabic) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="local_cuisine_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('localCuisineEnglish', { defaultValue: 'Local Cuisine (English) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="local_cuisine_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('localCuisineArabic', { defaultValue: 'Local Cuisine (Arabic) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shopping_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('shoppingEnglish', { defaultValue: 'Shopping (English) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shopping_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('shoppingArabic', { defaultValue: 'Shopping (Arabic) - comma separated' })}</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full p-2 border rounded"
                          value={(field.value || []).join(', ')}
                          onChange={(e) => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="best_time_to_visit_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('bestTimeToVisitEnglish', { defaultValue: 'Best Time To Visit (English)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., September to November" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="best_time_to_visit_ar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('bestTimeToVisitArabic', { defaultValue: 'Best Time To Visit (Arabic)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: من سبتمبر إلى نوفمبر" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="time_zone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('timeZoneSingle', { defaultValue: 'Time Zone (single value)' })}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., AEST (UTC+10)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Search window days */}
                <FormField
                  control={form.control}
                  name="search_window_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('searchWindowDays', { defaultValue: 'Search Window (days)' })}</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={365} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                 <FormField
                   control={form.control}
                   name="popular"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>{t('popularDestination', { defaultValue: 'Popular Destination' })}</FormLabel>
                       <FormControl>
                         <input
                           type="checkbox"
                           checked={Boolean(field.value)}
                           onChange={(e) => field.onChange((e.target as HTMLInputElement).checked)}
                           className="ml-2"
                         />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <div className="flex justify-end gap-2">
                   <Button 
                     type="button" 
                     variant="outline" 
                     onClick={handleDialogClose}
                     disabled={isSubmitting}
                   >
                     {t('cancel', { defaultValue: 'Cancel' })}
                   </Button>
                   <Button 
                     type="submit"
                     disabled={isSubmitting}
                     className="min-w-[120px]"
                   >
                     {isSubmitting ? (
                       <>
                         <span className="inline-block animate-spin mr-2">⏳</span>
                         {editDestination 
                           ? t('updating', { defaultValue: 'Updating...' })
                           : t('saving', { defaultValue: 'Saving...' })
                         }
                       </>
                     ) : (
                       <>
                         {editDestination ? t('update', { defaultValue: 'Update' }) : t('add', { defaultValue: 'Add' })}
                       </>
                     )}
                   </Button>
                 </div>
               </form>
             </Form>
           </DialogContent>
         </Dialog>
       </div>
   );
 };

 export default AdminDestinations;
