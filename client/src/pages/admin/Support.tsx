import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import api from '@/config/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { toastSuccess, toastError, confirmDialog } from '@/utils/i18nToast';
import { useTranslation } from 'react-i18next';

const AdminSupport: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'send' | 'messages' | 'email'>('send');

  // send form states
  const [recipientType, setRecipientType] = useState<'single' | 'all'>('single');
  const [recipient, setRecipient] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [messageAr, setMessageAr] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // messages
  type Contact = { _id: string; name?: string; email: string; message: string; createdAt?: string };
  type Newsletter = { _id: string; email: string; createdAt?: string };
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const { t } = useTranslation();

  // email tab state
  const [emailRecipientType, setEmailRecipientType] = useState<'single' | 'all'>('single');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [smtpAccount, setSmtpAccount] = useState<'wesam' | 'support' | 'info'>('support');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBodyHtml, setEmailBodyHtml] = useState('');
  const [emailPdf, setEmailPdf] = useState<File | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // fetch handlers for messages (keep hooks and functions unconditional)
  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const [cResp, nResp] = await Promise.all([
        api.get('/contact/admin'),
        api.get('/admin/newsletter/subscribers')
      ]);

      const cData = cResp?.data?.data ?? cResp?.data ?? [];
      const nData = nResp?.data?.data ?? nResp?.data ?? [];

      setContacts(Array.isArray(cData) ? cData : []);
      setNewsletters(Array.isArray(nData) ? nData : []);
    } catch (err) {
      console.error(err);
      toast.error(t('admin.support.loadMessagesFail'));
    } finally {
      setLoadingMessages(false);
    }
  }, [t]);

  // Mark contact message status (server supports PUT /api/contact/admin/:id)
  const handleDeleteContact = async (id: string) => {
    if (!confirmDialog('هل أنت متأكد من أرشفة هذه الرسالة؟', 'Are you sure you want to archive this message?')) return;
    try {
      await api.put(`/contact/admin/${id}`, { status: 'archived' });
      setContacts((s) => s.filter((c) => c._id !== id));
      toast.success(t('admin.support.archiveSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.support.archiveFail'));
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSubject || !emailBodyHtml) {
      toast.error(t('admin.support.emailSubjectBodyRequired'));
      return;
    }
    setEmailLoading(true);
    try {
      const form = new FormData();
      form.append('recipientType', emailRecipientType);
      if (emailRecipientType === 'single') {
        form.append('recipient', emailRecipient);
      }
      form.append('smtpAccount', smtpAccount);
      form.append('subject', emailSubject);
      form.append('bodyHtml', emailBodyHtml);
      if (emailPdf) form.append('pdf', emailPdf);

      const resp = await api.post('/support/send-email', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (resp.data?.success) {
        toast.success(t('admin.support.emailSent'));
        setEmailRecipient('');
        setEmailSubject('');
        setEmailBodyHtml('');
        setEmailPdf(null);
      } else {
        toast.error(t('admin.support.emailFailed'));
      }
    } catch (err) {
      console.error(err);
      toast.error(t('admin.support.emailFailed'));
    } finally {
      setEmailLoading(false);
    }
  };

  // Newsletter delete isn't supported server-side; provide copy-to-clipboard instead
  const handleCopyNewsletter = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success(t('admin.support.copySuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.support.copyFail'));
    }
  };

  useEffect(() => {
    if (tab === 'messages') fetchMessages();
  }, [tab, fetchMessages]);

  if (!user || user.role !== 'admin') {
    return (
      <AdminLayout>
        <div className="p-8">{t('admin.support.notAuthorized')}</div>
      </AdminLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const form = new FormData();
      form.append('recipientType', recipientType);
      if (recipientType === 'single') form.append('recipient', recipient);
      form.append('title', JSON.stringify({ en: titleEn, ar: titleAr }));
      form.append('message', JSON.stringify({ en: messageEn, ar: messageAr }));
      form.append('type', 'system');
      if (pdf) form.append('pdf', pdf);

      const resp = await api.post('/notifications/send', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (resp.data && resp.data.success) {
        toast.success(resp.data.message || 'Notification sent');
      } else {
        toast.error('Failed to send notification');
      }
      setRecipient('');
      setTitleEn('');
      setTitleAr('');
      setMessageEn('');
      setMessageAr('');
      setPdf(null);
    } catch (err: unknown) {
      console.error(err);
      let message = 'Error sending notification';
      if (err && typeof err === 'object' && 'response' in err) {
        // Try to read structured message from axios-like error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e: any = err;
        message = e?.response?.data?.message || e?.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('admin.support.title')}</h1>
          <div className="flex gap-2">
            <button onClick={() => setTab('send')} className={`px-3 py-1 rounded ${tab === 'send' ? 'bg-blue-600 text-white' : 'border'}`}>
              {t('admin.support.sendNotification')}
            </button>
            <button onClick={() => setTab('messages')} className={`px-3 py-1 rounded ${tab === 'messages' ? 'bg-blue-600 text-white' : 'border'}`}>
              {t('admin.support.messages')}
            </button>
            <button onClick={() => setTab('email')} className={`px-3 py-1 rounded ${tab === 'email' ? 'bg-blue-600 text-white' : 'border'}`}>
              {t('admin.support.emailTab')}
            </button>
          </div>
        </div>

        {tab === 'send' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t('admin.support.sendNotification')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.recipient')}</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={recipientType === 'single'} onChange={() => setRecipientType('single')} />
                    <span>{t('admin.support.singleUser')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={recipientType === 'all'} onChange={() => setRecipientType('all')} />
                    <span>{t('admin.support.allUsers')}</span>
                  </label>
                </div>
                {recipientType === 'single' && (
                  <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={t('admin.support.emailOrUsernamePlaceholder')} className="mt-2 w-full border rounded p-2" />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.titleEnglish')}</label>
                <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.titleArabic')}</label>
                <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="w-full border rounded p-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.messageEnglish')}</label>
                <textarea value={messageEn} onChange={(e) => setMessageEn(e.target.value)} className="w-full border rounded p-2" rows={4} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.messageArabic')}</label>
                <textarea value={messageAr} onChange={(e) => setMessageAr(e.target.value)} className="w-full border rounded p-2" rows={4} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.optionalPdf')}</label>
                <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files ? e.target.files[0] : null)} />
              </div>

              <div>
                <button disabled={loading} type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
                  {loading ? t('admin.support.sending') : t('admin.support.sendButton')}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t('admin.support.emailTitle')}</h2>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.emailFrom')}</label>
                <select
                  value={smtpAccount}
                  onChange={(e) => setSmtpAccount(e.target.value as 'wesam' | 'support' | 'info')}
                  className="w-full border rounded p-2"
                >
                  <option value="wesam">wesam.badr@tourtastic.net</option>
                  <option value="support">support@tourtastic.net</option>
                  <option value="info">info@tourtastic.net</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.recipient')}</label>
                <div className="flex gap-3 flex-wrap">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={emailRecipientType === 'single'} onChange={() => setEmailRecipientType('single')} />
                    <span>{t('admin.support.singleUser')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={emailRecipientType === 'all'} onChange={() => setEmailRecipientType('all')} />
                    <span>{t('admin.support.allUsers')}</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {emailRecipientType === 'all' ? t('admin.support.emailAllHint') : t('admin.support.emailPlaceholder')}
                </p>
                {emailRecipientType === 'single' ? (
                  <input value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder={t('admin.support.emailPlaceholder')} className="mt-2 w-full border rounded p-2" />
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.emailSubject')}</label>
                <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full border rounded p-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.emailBodyHtml')}</label>
                <textarea value={emailBodyHtml} onChange={(e) => setEmailBodyHtml(e.target.value)} className="w-full border rounded p-2" rows={8} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.support.optionalPdf')}</label>
                <input type="file" accept="application/pdf" onChange={(e) => setEmailPdf(e.target.files ? e.target.files[0] : null)} />
              </div>

              <div>
                <button disabled={emailLoading} type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
                  {emailLoading ? t('admin.support.sendingEmail') : t('admin.support.sendEmail')}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'messages' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('admin.support.messages')}</h2>
              <div className="text-sm text-gray-600">{t('admin.support.contactsCount', { count: contacts.length })} • {t('admin.support.newslettersCount', { count: newsletters.length })}</div>
            </div>

            {loadingMessages ? (
              <div>{t('admin.support.loading')}</div>
            ) : (
              <div className="space-y-6">
                <section>
                  <h3 className="font-medium mb-3">Contact Messages</h3>
                  {contacts.length === 0 ? (
                    <div className="text-sm text-gray-500">No contact messages</div>
                  ) : (
                    <div className="space-y-3">
                      {contacts.map((c) => (
                        <div key={c._id} className="border rounded p-4 bg-white shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold">{c.name || c.email}</div>
                              <div className="text-sm text-gray-600">{c.email}</div>
                            </div>
                            <div className="text-sm text-gray-500">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</div>
                          </div>
                          <p className="mt-3 whitespace-pre-line">{c.message}</p>
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => handleDeleteContact(c._id)} className="text-sm text-red-600">{t('admin.support.delete')}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="font-medium mb-3">Newsletter Signups</h3>
                  {newsletters.length === 0 ? (
                    <div className="text-sm text-gray-500">No newsletter signups</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {newsletters.map((n) => (
                        <div
                          key={n._id}
                          className="border rounded p-3 bg-white shadow-sm flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            {/* Email: allow wrapping on mobile to avoid overflow; on larger screens it will behave normally */}
                            <div className="font-medium break-all sm:break-words overflow-hidden">
                              {n.email}
                            </div>
                            <div className="text-sm text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                              {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <button
                              onClick={() => handleCopyNewsletter(n.email)}
                              className="text-sm text-blue-600"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </div>
  );
};

export default AdminSupport;
