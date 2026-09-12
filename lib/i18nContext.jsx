'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { normalizeLocale, t as tFn } from './i18n';

const I18nCtx = createContext(null);
export const LOCALE_STORAGE_KEY = 'bcr_locale';

function readStoredLocale() {
  if (typeof window === 'undefined') return 'en';
  try { return normalizeStoredLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)); } catch { return 'en'; }
}

function normalizeStoredLocale(locale) {
  return normalizeLocale(locale || 'en');
}

export function I18nProvider({ children }) {
  // 言語をlocalStorageに保存し、リロード（外部決済からの復帰含む）でも維持する
  const [locale, setLocaleState] = useState(readStoredLocale);

  const setLocale = useCallback((next) => {
    const normalized = normalizeStoredLocale(next);
    setLocaleState(normalized);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized); } catch { /* ignore */ }
    }
  }, []);

  const t = useCallback((key) => tFn(locale, key), [locale]);

  return (
    <I18nCtx.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export const useI18n = () => useContext(I18nCtx);
