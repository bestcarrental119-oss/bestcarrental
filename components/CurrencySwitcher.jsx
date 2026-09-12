'use client';
import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '../lib/currency';

// Compact currency selector (light or dark variant) for the navbar.
export default function CurrencySwitcher({ dark = false }) {
  const { currency, setCurrency, CURRENCIES, updatedAt } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const btn = dark
    ? 'border-gray-700 bg-gray-800/70 text-gray-200 hover:border-gray-500'
    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${btn}`}
      >
        <span>{cur.symbol}</span>
        <span className="hidden sm:inline">{cur.code}</span>
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto">
          {CURRENCIES.map(c => (
            <button
              key={c.code}
              onClick={() => { setCurrency(c.code); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                currency === c.code ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="w-8">{c.symbol}</span>
              <span className="font-medium">{c.code}</span>
              <span className="text-gray-400 text-xs ml-auto">{c.label}</span>
            </button>
          ))}
          {updatedAt && <p className="text-gray-400 text-[10px] px-4 py-2 border-t border-gray-100">参考レート · {updatedAt}</p>}
        </div>
      )}
    </div>
  );
}
