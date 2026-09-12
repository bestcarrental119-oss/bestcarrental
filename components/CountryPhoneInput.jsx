'use client';
import { useState, useEffect } from 'react';
import { COUNTRY_CODES, splitPhone } from '../lib/countries';

/**
 * Phone input where the country code is chosen first, then the number.
 * Emits the combined value "+81 90-1234-5678" via onChange.
 *
 * Props: value, onChange(full), label, dark (default true)
 */
export default function CountryPhoneInput({ value = '', onChange, label, dark = true }) {
  const init = splitPhone(value);
  const [dial, setDial]     = useState(init.dial);
  const [number, setNumber] = useState(init.number);

  useEffect(() => {
    const s = splitPhone(value);
    setDial(s.dial);
    setNumber(s.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (d, n) => {
    const cleaned = n.replace(/[^\d-]/g, '');
    onChange?.(cleaned ? `${d} ${cleaned}` : d);
  };

  const base = dark
    ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500';

  return (
    <div>
      {label && <label className={`block text-xs mb-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</label>}
      <div className="flex gap-2">
        <select
          value={dial}
          onChange={e => { setDial(e.target.value); emit(e.target.value, number); }}
          className={`border rounded-lg px-2 py-2 text-sm focus:outline-none ${base}`}
          style={{ maxWidth: '8.5rem' }}
        >
          {COUNTRY_CODES.map(c => (
            <option key={c.iso} value={c.dial}>{c.flag} {c.dial}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={number}
          onChange={e => { setNumber(e.target.value); emit(dial, e.target.value); }}
          placeholder="90-1234-5678"
          className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none ${base}`}
        />
      </div>
    </div>
  );
}
