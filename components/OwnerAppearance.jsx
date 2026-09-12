'use client';
import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../lib/i18nContext';

// Owner-dashboard colour skins. The dashboard is built with dark Tailwind
// utility classes; each non-dark skin remaps those surface classes within the
// `.owner-skin-*` scope via the injected <style> below — so we don't have to
// rewrite 1,400 lines of markup.
export const SKIN_OPTIONS = [
  { id: 'dark',  emoji: '🌑', labelKey: 'themeDark',  label: 'Dark' },
  { id: 'light', emoji: '☀️', labelKey: 'themeLight', label: 'Light' },
  { id: 'slate', emoji: '🪨', labelKey: 'themeSlate', label: 'Slate' },
  { id: 'navy',  emoji: '🌊', labelKey: 'themeNavy', label: 'Navy' },
];

export function readOwnerSkin() {
  if (typeof window === 'undefined') return 'light';
  try { return window.localStorage.getItem('bcr:ownerSkin') || 'light'; } catch (_) { return 'light'; }
}

// One static stylesheet covering every non-dark skin.
export function OwnerSkinStyles() {
  return (
    <style>{`
      /* ── LIGHT (Airbnb-style) ──────────────────────────── */
      /* Surfaces */
      .owner-skin-light.bg-gray-950, .owner-skin-light .bg-gray-950 { background:#f7f7f7 !important; }
      .owner-skin-light .bg-gray-900,
      .owner-skin-light .bg-gray-900\\/90,
      .owner-skin-light .bg-gray-900\\/80 { background:#ffffff !important; }
      .owner-skin-light .bg-gray-800 { background:#f2f3f5 !important; }
      .owner-skin-light .bg-gray-800\\/40, .owner-skin-light .bg-gray-800\\/50 { background:#f4f5f7 !important; }
      .owner-skin-light .bg-gray-700, .owner-skin-light .bg-gray-700\\/60 { background:#e7e9ee !important; }
      /* Borders */
      .owner-skin-light .border-gray-800 { border-color:#ebebeb !important; }
      .owner-skin-light .border-gray-700 { border-color:#dddddd !important; }
      .owner-skin-light .border-gray-600 { border-color:#cfcfcf !important; }
      /* Text */
      .owner-skin-light .text-white { color:#222222 !important; }
      .owner-skin-light .text-gray-200 { color:#2b2b2b !important; }
      .owner-skin-light .text-gray-300 { color:#404040 !important; }
      .owner-skin-light .text-gray-400 { color:#6a6a6a !important; }
      .owner-skin-light .text-gray-500 { color:#767676 !important; }
      .owner-skin-light .text-gray-600 { color:#626262 !important; }
      .owner-skin-light .text-gray-700 { color:#4f4f4f !important; }
      .owner-skin-light input::placeholder,
      .owner-skin-light textarea::placeholder { color:#747474 !important; opacity:1 !important; }
      .owner-skin-light select,
      .owner-skin-light input,
      .owner-skin-light textarea { color:#222222 !important; }
      .owner-skin-light button[style*="linear-gradient"],
      .owner-skin-light [style*="linear-gradient"].text-white,
      .owner-skin-light .bg-purple-600.text-white,
      .owner-skin-light .bg-red-600.text-white,
      .owner-skin-light .bg-green-700.text-white,
      .owner-skin-light .bg-amber-600.text-white,
      .owner-skin-light .bg-orange-600.text-white,
      .owner-skin-light .bg-blue-600.text-white { color:#ffffff !important; }
      /* Soft card shadow + hairline like Airbnb */
      .owner-skin-light .rounded-2xl.bg-gray-900,
      .owner-skin-light .bg-gray-900.rounded-2xl { box-shadow:0 1px 2px rgba(0,0,0,.04), 0 4px 14px rgba(0,0,0,.06) !important; }
      /* Coloured status tints → light equivalents */
      .owner-skin-light .bg-green-900\\/20, .owner-skin-light .bg-green-900\\/40 { background:#e6f7ec !important; }
      .owner-skin-light .text-green-300, .owner-skin-light .text-green-400 { color:#1a7f43 !important; }
      .owner-skin-light .border-green-700\\/40, .owner-skin-light .border-green-700\\/60 { border-color:#a9e0bd !important; }
      .owner-skin-light .bg-yellow-900\\/40 { background:#fdf3d7 !important; }
      .owner-skin-light .text-yellow-400 { color:#a9791c !important; }
      .owner-skin-light .border-yellow-700\\/40 { border-color:#eed9a6 !important; }
      .owner-skin-light .bg-orange-900\\/30 { background:#fdeede !important; }
      .owner-skin-light .text-orange-200, .owner-skin-light .text-orange-300 { color:#b5651a !important; }
      .owner-skin-light .border-orange-700 { border-color:#f0c79a !important; }
      .owner-skin-light .bg-blue-900\\/40 { background:#e5eefc !important; }
      .owner-skin-light .text-blue-300, .owner-skin-light .text-blue-400 { color:#2563a8 !important; }
      .owner-skin-light .border-blue-700\\/40 { border-color:#b6cdf0 !important; }
      .owner-skin-light .bg-red-900\\/40 { background:#fce8e8 !important; }
      .owner-skin-light .text-red-400 { color:#c23a3a !important; }
      .owner-skin-light .border-red-700\\/40 { border-color:#f0bcbc !important; }
      .owner-skin-light .bg-purple-950\\/50, .owner-skin-light .bg-purple-900\\/30, .owner-skin-light .bg-purple-900\\/60 { background:#f1ecfb !important; }
      .owner-skin-light .text-purple-100, .owner-skin-light .text-purple-200, .owner-skin-light .text-purple-300 { color:#6d28d9 !important; }
      .owner-skin-light .border-purple-500\\/50, .owner-skin-light .border-purple-500\\/60, .owner-skin-light .border-purple-500\\/30 { border-color:#d6c6f5 !important; }

      /* ── SLATE ─────────────────────────────────────────── */
      .owner-skin-slate.bg-gray-950, .owner-skin-slate .bg-gray-950 { background:#1e293b !important; }
      .owner-skin-slate .bg-gray-900 { background:#273449 !important; }
      .owner-skin-slate .border-gray-800 { border-color:#3b4a63 !important; }
      .owner-skin-slate .border-gray-700 { border-color:#46566f !important; }
      .owner-skin-slate .bg-gray-800 { background:#334158 !important; }

      /* ── NAVY ──────────────────────────────────────────── */
      .owner-skin-navy.bg-gray-950, .owner-skin-navy .bg-gray-950 { background:#0b1430 !important; }
      .owner-skin-navy .bg-gray-900 { background:#13203f !important; }
      .owner-skin-navy .border-gray-800 { border-color:#243456 !important; }
      .owner-skin-navy .border-gray-700 { border-color:#2c3e63 !important; }
      .owner-skin-navy .bg-gray-800 { background:#1b2a4d !important; }
    `}</style>
  );
}

// Dropdown selector placed in the dashboard header.
export default function OwnerAppearanceSelector({ skin, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = SKIN_OPTIONS.find(s => s.id === skin) ?? SKIN_OPTIONS[0];

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = (s) => (s.labelKey ? (t(s.labelKey) || s.label) : s.label);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-700 bg-gray-900 text-gray-200 text-xs font-medium hover:border-gray-500 transition-all">
        🎨 {t('ownerAppearance')}: {cur.emoji} {label(cur)}
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50">
          {SKIN_OPTIONS.map(s => (
            <button key={s.id}
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                skin === s.id ? 'bg-purple-900/30 text-purple-200 font-semibold' : 'text-gray-300 hover:bg-gray-800'
              }`}>
              <span>{s.emoji}</span><span>{label(s)}</span>
              {skin === s.id && <span className="ml-auto text-xs text-purple-300">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
