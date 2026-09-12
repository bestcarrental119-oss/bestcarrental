'use client';
import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { GradBtn } from './Shared';
import { Honeypot } from './Captcha';
import { validateEmail } from '../lib/validation';

// ── Shared page shell ─────────────────────────────────────────────────────────
function PageShell({ children, theme }) {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4" style={{ background: theme.pageBg }}>
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  );
}

// ── Privacy / Terms — content comes from admin-editable state.pages ──────────
export function TextPage({ pageKey }) {
  const { state } = useApp();
  const { theme, pages } = state;
  const page = pages?.[pageKey] ?? { title: '', body: '' };

  return (
    <PageShell theme={theme}>
      <h1 className="text-3xl font-bold text-white mb-8">{page.title}</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
        {page.body.split('\n\n').map((para, i) => (
          <p key={i} className="text-gray-300 text-sm leading-relaxed whitespace-pre-line mb-5 last:mb-0">
            {para}
          </p>
        ))}
      </div>
    </PageShell>
  );
}

// ── Contact page with working form ────────────────────────────────────────────
export function ContactPage() {
  const { state } = useApp();
  const { theme, pages, currentUser } = state;
  const { t } = useI18n();
  const info = pages?.contact ?? {};

  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    if (currentUser) {
      setForm(f => ({ ...f, name: f.name || currentUser.name || '', email: f.email || currentUser.email || '' }));
    }
  }, [currentUser]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr('');
    if (!form.name.trim())       { setErr(t('errNameRequired')); return; }
    if (!validateEmail(form.email)) { setErr(t('errEmailInvalid')); return; }
    if (!form.message.trim())    { setErr(t('contactMessage')); return; }
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, honeypot }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Failed to send');
      }
      setSent(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell theme={theme}>
      <h1 className="text-3xl font-bold text-white mb-3">{info.title || t('contactUs')}</h1>
      {info.intro && <p className="text-gray-400 text-sm mb-8">{info.intro}</p>}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Contact info card */}
        <div className="md:col-span-1 space-y-3">
          {[
            info.email   && { icon: '📧', val: info.email },
            info.phone   && { icon: '📞', val: info.phone },
            info.hours   && { icon: '🕘', val: info.hours },
            info.address && { icon: '📍', val: info.address },
          ].filter(Boolean).map((item, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              <span className="text-gray-300 text-sm break-all">{item.val}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {sent ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-white font-semibold">{t('contactSent')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Honeypot value={honeypot} onChange={setHoneypot} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('contactName')} *</label>
                  <input value={form.name} onChange={e => upd('name', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('contactEmail')} *</label>
                  <input type="email" value={form.email} onChange={e => upd('email', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('contactSubject')}</label>
                <input value={form.subject} onChange={e => upd('subject', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('contactMessage')} *</label>
                <textarea rows={6} value={form.message} onChange={e => upd('message', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y" />
              </div>
              {err && <p className="text-red-400 text-sm">⚠ {err}</p>}
              <GradBtn theme={theme} onClick={submit} disabled={sending} className="px-6 py-2.5 text-sm">
                {sending ? '…' : t('contactSend')}
              </GradBtn>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
