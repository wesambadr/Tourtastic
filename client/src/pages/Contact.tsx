import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toastSuccess, toastError } from '@/utils/i18nToast';
import { Mail, Phone, MapPin, Send, Clock, MessageSquare, Headset } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

type ContactFormValues = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const Contact: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  
  // Form schema for validation
  const contactFormSchema = z.object({
    name: z.string().min(2, { message: t('nameValidation', 'Name must be at least 2 characters') }),
    email: z.string().email({ message: t('emailValidation', 'Please enter a valid email address') }),
    subject: z.string().min(5, { message: t('subjectValidation', 'Subject must be at least 5 characters') }),
    message: z.string().min(10, { message: t('messageValidation', 'Message must be at least 10 characters') }),
  });

  const { 
    register, 
    handleSubmit, 
    reset,
    formState: { errors, isSubmitting } 
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  const onSubmit = async (data: ContactFormValues) => {
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      toastSuccess(
        'تم إرسال رسالتك بنجاح! سنقوم بالرد عليك خلال 24 ساعة.',
        'Your message has been sent successfully! We will reply within 24 hours.'
      );
      reset();
    } catch (error) {
      toastError('فشل إرسال الرسالة. الرجاء المحاولة لاحقاً', 'Failed to send message. Please try again later.');
      console.error('Contact form error:', error);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-16">
      {/* Premium Hero Banner */}
      <div className="relative bg-gradient-to-r from-tourtastic-dark-blue via-tourtastic-blue to-cyan-700 py-20 text-white overflow-hidden shadow-lg">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="container-custom relative z-10 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-medium mb-4 border border-white/20">
            <Headset className="h-4 w-4 text-cyan-300" />
            <span>{isArabic ? 'خدمة العملاء على مدار 24/7' : '24/7 Customer Service'}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
            {t('contactUs', 'اتصل بنا')}
          </h1>
          <p className="text-lg md:text-xl text-blue-100 leading-relaxed">
            {t('contactIntro', "لديك استفسار أو تحتاج مساعدة في حجزك؟ فريق تورتاستيك متواجد دائماً لمساعدتك بكفاءة وسرعة.")}
          </p>
        </div>
      </div>

      <div className="py-12 container-custom -mt-8 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Contact Form Card */}
          <div className="lg:col-span-7 animate-fade-in">
            <Card className="shadow-xl border-0 bg-white/95 backdrop-blur-sm rounded-2xl overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-tourtastic-blue to-cyan-500"></div>
              <CardHeader className="p-6 md:p-8 pb-2">
                <CardTitle className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <MessageSquare className="h-7 w-7 text-tourtastic-blue" />
                  <span>{t('sendUsAMessage', 'أرسل لنا رسالة')}</span>
                </CardTitle>
                <CardDescription className="text-gray-600 text-base mt-2">
                  {t('fillOutTheFormBelowAndWe', 'يسعدنا تواصلك معنا، يسعدنا الإجابة عن كافة استفساراتك في أسرع وقت ممكن.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 md:p-8 pt-4">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-gray-700 font-medium">{t('fullName', 'الاسم الكامل')}</Label>
                      <Input 
                        id="name" 
                        placeholder={isArabic ? 'أدخل اسمك الكريم' : 'Enter your full name'} 
                        className="h-11 rounded-lg border-gray-300 focus:border-tourtastic-blue focus:ring-tourtastic-blue"
                        {...register('name')} 
                      />
                      {errors.name && (
                        <p className="text-xs text-red-500 font-medium mt-1">{errors.name.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-700 font-medium">{t('emailAddress', 'البريد الإلكتروني')}</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder={isArabic ? 'example@mail.com' : 'your.email@example.com'} 
                        className="h-11 rounded-lg border-gray-300 focus:border-tourtastic-blue focus:ring-tourtastic-blue"
                        {...register('email')} 
                      />
                      {errors.email && (
                        <p className="text-xs text-red-500 font-medium mt-1">{errors.email.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-gray-700 font-medium">{t('subject', 'عنوان الرسالة')}</Label>
                    <Input 
                      id="subject" 
                      placeholder={isArabic ? 'كيف يمكننا مساعدتك؟' : 'What is this regarding?'} 
                      className="h-11 rounded-lg border-gray-300 focus:border-tourtastic-blue focus:ring-tourtastic-blue"
                      {...register('subject')} 
                    />
                    {errors.subject && (
                      <p className="text-xs text-red-500 font-medium mt-1">{errors.subject.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-gray-700 font-medium">{t('message', 'نص الرسالة')}</Label>
                    <Textarea 
                      id="message" 
                      placeholder={isArabic ? 'اكتب تفاصيل استفسارك هنا...' : 'How can we help you?'} 
                      rows={5}
                      className="rounded-lg border-gray-300 focus:border-tourtastic-blue focus:ring-tourtastic-blue"
                      {...register('message')} 
                    />
                    {errors.message && (
                      <p className="text-xs text-red-500 font-medium mt-1">{errors.message.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg font-semibold bg-tourtastic-blue hover:bg-tourtastic-dark-blue text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>{t('sending', 'جاري الإرسال...')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Send className="h-5 w-5" />
                        <span>{t('sendMessage', 'إرسال الرسالة')}</span>
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information Cards */}
          <div className="lg:col-span-5 space-y-6 animate-fade-in animation-delay-200">
            <div className="grid grid-cols-1 gap-5">
              {/* Phone Card */}
              <Card className="shadow-lg border border-blue-100 rounded-2xl bg-gradient-to-br from-white to-blue-50/50 hover:shadow-xl transition-all duration-300 overflow-hidden">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-tourtastic-blue p-4 rounded-2xl text-white shadow-md flex-shrink-0 mt-1">
                    <Phone className="h-7 w-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-gray-900 text-lg">{t('callUs', 'اتصل بنا مباشرة')}</h3>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        {isArabic ? 'متاح الآن' : 'Available'}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm mb-3">
                      {isArabic ? 'لأي استفسار عن الرحلات والتذاكر أو تعديل الحجز:' : 'For inquiries regarding flights, tickets, or bookings:'}
                    </p>
                    <a 
                      href="tel:+963098697313" 
                      dir="ltr" 
                      className="inline-flex items-center gap-2 text-xl font-extrabold text-tourtastic-blue hover:text-tourtastic-dark-blue transition-colors bg-white px-4 py-2 rounded-xl border border-blue-200 shadow-sm"
                    >
                      <span>+963 098697313</span>
                    </a>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-3">
                      <Clock className="h-4 w-4 text-tourtastic-blue" />
                      <span>{isArabic ? 'خدمة هاتفية فورية ومباشرة' : 'Immediate phone support'}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Email Card */}
              <Card className="shadow-lg border border-gray-100 rounded-2xl bg-white hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-cyan-500 p-4 rounded-2xl text-white shadow-md flex-shrink-0 mt-1">
                    <Mail className="h-7 w-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{t('emailUs', 'البريد الإلكتروني')}</h3>
                    <p className="text-gray-500 text-sm mb-3">
                      {isArabic ? 'أرسل لنا تفاصيل استفسارك وستصلك إجابة شاملة:' : 'Send us your inquiries and receive a quick response:'}
                    </p>
                    <a 
                      href="mailto:info@tourtastic.com" 
                      dir="ltr" 
                      className="inline-flex items-center gap-2 text-lg font-bold text-gray-800 hover:text-tourtastic-blue transition-colors bg-gray-50 px-4 py-2 rounded-xl border border-gray-200"
                    >
                      <span>info@tourtastic.com</span>
                    </a>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-3">
                      <Clock className="h-4 w-4 text-cyan-600" />
                      <span>{isArabic ? 'الرد خلال أقل من 24 ساعة' : 'Replies within 24 hours'}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Support Card */}
              <Card className="shadow-lg border border-indigo-100 rounded-2xl bg-gradient-to-br from-tourtastic-dark-blue to-tourtastic-blue text-white">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                      <Headset className="h-6 w-6 text-cyan-300" />
                    </div>
                    <h3 className="font-bold text-lg">{isArabic ? 'دعم حجز الرحلات' : 'Flight Booking Support'}</h3>
                  </div>
                  <p className="text-blue-100 text-sm leading-relaxed mb-4">
                    {isArabic 
                      ? 'فريق خبراء تورتاستيك يتيح لك حجز وتأكيد رحلاتك بأفضل الأسعار وأسهل الطرق.' 
                      : 'Tourtastic expert team ensures smooth flight booking and instant confirmation at best rates.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
