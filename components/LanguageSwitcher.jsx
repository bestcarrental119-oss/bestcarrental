'use client';
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../lib/i18nContext';
import { LOCALES } from '../lib/i18n';

// dark=true → フロントエンドのダークナビバー用スタイル
// dark=false (default) → 管理画面の白背景用スタイル
export default function LanguageSwitcher({ dark = false }) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LOCALES.find(l => l.code === locale);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const btnClass = dark
    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-700 hover:border-gray-500 bg-gray-800/60 text-gray-300 hover:text-white text-sm font-medium transition-all'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 hover:border-purple-400 bg-white text-gray-700 text-sm font-medium transition-all hover:bg-purple-50';

  const dropdownClass = dark
    ? 'absolute right-0 top-full mt-2 w-44 bg-gray-900 border border-gray-700 rounded-2xl shadow-xl overflow-hidden z-50'
    : 'absolute right-0 top-full mt-2 w-44 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-50';

  const itemClass = (selected) => dark
    ? `w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${selected ? 'bg-purple-900/40 text-purple-300 font-semibold' : 'text-gray-300 hover:bg-gray-800'}`
    : `w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${selected ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`;

  const checkColor = dark ? 'text-purple-400' : 'text-purple-600';
  const arrowColor = dark ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={btnClass}>
        <span className="text-base">{current?.flag}</span>
        <span className="hidden sm:inline">{current?.label}</span>
        <svg className={`w-3 h-3 ${arrowColor} transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={dropdownClass}>
          {LOCALES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLocale(l.code); setOpen(false); }}
              className={itemClass(locale === l.code)}
            >
              <span className="text-lg">{l.flag}</span>
              <span>{l.label}</span>
              {locale === l.code && (
                <svg className={`ml-auto w-4 h-4 ${checkColor}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
