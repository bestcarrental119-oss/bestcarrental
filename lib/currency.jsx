'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── Supported currencies (base = JPY) ────────────────────────────────────────
// `rate` = how many units of this currency per 1 JPY (approximate fallback).
// Live rates are fetched from /api/fx and override these on load.
export const CURRENCIES = [
  { code: 'JPY', symbol: '¥',  label: '日本円',         rate: 1 },
  { code: 'USD', symbol: '$',  label: 'US Dollar',      rate: 0.0064 },
  { code: 'EUR', symbol: '€',  label: 'Euro',           rate: 0.0059 },
  { code: 'CNY', symbol: 'CN¥',label: '人民币',         rate: 0.046 },
  { code: 'KRW', symbol: '₩',  label: '원',             rate: 8.8 },
  { code: 'TWD', symbol: 'NT$',label: '新台幣',         rate: 0.205 },
  { code: 'HKD', symbol: 'HK$',label: 'HK Dollar',      rate: 0.050 },
  { code: 'GBP', symbol: '£',  label: 'Pound',          rate: 0.0050 },
  { code: 'AUD', symbol: 'A$', label: 'AU Dollar',      rate: 0.0098 },
  { code: 'THB', symbol: '฿',  label: 'Baht',           rate: 0.232 },
  { code: 'SGD', symbol: 'S$', label: 'SG Dollar',      rate: 0.0086 },
];

const FALLBACK_RATES = Object.fromEntries(CURRENCIES.map(c => [c.code, c.rate]));

const CurrencyCtx = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState('JPY');
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('bcr:currency');
      if (saved && FALLBACK_RATES[saved] != null) setCurrencyState(saved);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetch('/api/fx')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.rates) {
          setRates({ ...FALLBACK_RATES, ...data.rates });
          setUpdatedAt(data.updatedAt ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const setCurrency = useCallback((code) => {
    setCurrencyState(code);
    try { window.localStorage.setItem('bcr:currency', code); } catch (_) {}
  }, []);

  const convert = useCallback((amountJPY, code = currency) => {
    const r = rates[code] ?? FALLBACK_RATES[code] ?? 1;
    return (Number(amountJPY) || 0) * r;
  }, [rates, currency]);

  const meta = (code = currency) => CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];

  const format = useCallback((amountJPY, code = currency) => {
    const m = meta(code);
    const val = convert(amountJPY, code);
    if (code === 'JPY') return `¥${Math.round(val).toLocaleString()}`;
    if (['KRW', 'TWD', 'THB'].includes(code)) return `${m.symbol}${Math.round(val).toLocaleString()}`;
    return `${m.symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [convert, currency]);

  return (
    <CurrencyCtx.Provider value={{ currency, setCurrency, rates, updatedAt, convert, format, meta, CURRENCIES }}>
      {children}
    </CurrencyCtx.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyCtx) ?? {
  currency: 'JPY', setCurrency: () => {}, rates: FALLBACK_RATES, updatedAt: null,
  convert: (a) => a, format: (a) => `¥${Math.round(Number(a) || 0).toLocaleString()}`,
  meta: () => CURRENCIES[0], CURRENCIES,
};
