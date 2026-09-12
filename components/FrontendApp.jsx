'use client';
import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { GradBtn, Tag } from './Shared';
import { VEHICLE_CLASSES, SERVICE_TABS, JAPAN_AIRPORTS } from '../lib/data';
import BookingModal from './BookingModal';
import MyPage from './MyPage';
import OwnerDashboard from './OwnerDashboard';
import OwnerOnboarding from './OwnerOnboarding';
import AppLoader from './AppLoader';
import RunOfFleetCard from './RunOfFleetCard';
import { buildClassVirtualListings, BOOKING_TYPES } from '../lib/runOfFleet';
import MapSearch from './MapSearch';
import OneWayPage from './oneway/OneWayPage';
import OneWayBanner from './oneway/OneWayBanner';
import CrossReturnBooth from './CrossReturnBooth';
import LanguageSwitcher from './LanguageSwitcher';
import CurrencySwitcher from './CurrencySwitcher';
import { useCurrency } from '../lib/currency';
import ChatModal from './ChatModal';
import { supabase } from '../lib/supabase';
import { isFavorite, toggleFavorite, addRecentlyViewed } from '../lib/favorites';
import { haptic } from '../lib/native';
import { reverseGeocode } from '../lib/googleMaps';

// Heart toggle for favouriting a vehicle. Optimistic + haptic, syncs app-wide.
function FavButton({ id, className = '' }) {
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(isFavorite(id)); }, [id]);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); const now = toggleFavorite(id); setFav(now); haptic(now ? 'success' : 'light'); }}
      aria-label="Favorite"
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm text-lg active:scale-90 ${className}`}
    >
      <span className={fav ? 'text-rose-500' : 'text-white'}>{fav ? '♥' : '♡'}</span>
    </button>
  );
}

// ── Airbnb-style line icons for the mobile tab bar ────────────────────────────
const navIcon = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IconHome   = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>);
const IconSearch = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>);
const IconHeart  = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M12 20.5s-7.5-4.6-9.5-9C1 8.5 2.6 5.5 5.8 5.5c2 0 3.3 1.2 4.2 2.5.9-1.3 2.2-2.5 4.2-2.5 3.2 0 4.8 3 3.3 6-2 4.4-9.5 9-9.5 9Z" /></svg>);
const IconTrips  = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const IconChat   = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5.5A8 8 0 1 1 21 12Z" /></svg>);
const IconOwner  = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M5 17h14M6 17l1.2-4.5A2 2 0 0 1 9.1 11h5.8a2 2 0 0 1 1.9 1.5L18 17" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>);
const IconToday    = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M6 3v4M18 3v4M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M9 13l2 2 4-4" /></svg>);
const IconCalendar = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>);
const IconCar      = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M5 16h14M6 16l1.4-5A2 2 0 0 1 9.3 9.5h5.4a2 2 0 0 1 1.9 1.5L18 16M4 16v2M20 16v2M4 16h16v-2a2 2 0 0 0-.5-1.3" /><circle cx="8" cy="18.5" r="1.3" /><circle cx="16" cy="18.5" r="1.3" /></svg>);
const IconMenu     = (p) => (<svg viewBox="0 0 24 24" width="24" height="24" {...navIcon} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
function IconBestGoMark() {
  return <img src={`/best-${'go'}-icon.png`} alt="" className="h-6 w-6 rounded-lg object-cover ring-1 ring-purple-500/40" />;
}
function IconOneWayMark() {
  return <img src="/oneway-icon.png" alt="" className="h-6 w-6 rounded-lg object-cover ring-1 ring-fuchsia-500/40" />;
}

export function Navbar() {
  const { state, dispatch } = useApp();
  const { currentUser, frontendPage, chatUnread, ownerTab, mypageTab } = state;
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bestGoOneWayActive, setBestGoOneWayActive] = useState('accept');

  // Owner context → repurpose the renter "Search" slot for owner management.
  const isOwnerContext =
    currentUser?.role === 'owner' ||
    frontendPage === 'owner-dashboard' ||
    frontendPage === 'owner-register';

  // While inside the owner dashboard, the bottom bar becomes owner shortcuts.
  const onOwnerDashboard = frontendPage === 'owner-dashboard';
  const activeOwnerTab = ownerTab ?? 'today';
  const onBestGoOneWayManagement = onOwnerDashboard && activeOwnerTab === 'best-go-oneway';
  const ownerShortcuts = [
    { id: 'today',    label: t('od_today'),        Icon: IconToday },
    { id: 'calendar', label: t('ownerTabCalendar'),   Icon: IconCalendar },
    { id: 'vehicles', label: t('ownerTabVehicles'),     Icon: IconCar },
    { id: 'chat',     label: t('ownerTabChat'),   Icon: IconChat, badge: chatUnread },
    { id: 'menu',     label: t('od_menu'),     Icon: IconMenu },
  ];
  const bestGoOneWayShortcuts = [
    { id: 'accept',       label: t('bestGoNavAccept'),     Icon: IconBestGoMark },
    { id: 'vehicles',     label: t('bestGoNavVehicles'),   Icon: IconCar },
    { id: 'send',         label: t('bestGoNavSend'),     Icon: IconOwner },
    { id: 'ops',          label: t('bestGoNavOps'),     Icon: IconTrips },
    { id: 'best-one-way', label: t('bestGoNavOneWay'),  Icon: IconOneWayMark },
    { id: 'menu',         label: t('od_menu'), Icon: IconMenu },
  ];
  const goOwnerTab = id => {
    if (id === 'chat' && typeof window !== 'undefined' && window.__openOwnerChat) {
      window.__openOwnerChat(); // sets the chat tab and clears its unread badge
    } else {
      dispatch({ type: 'SET_OWNER_TAB', v: id });
    }
  };
  const goBestGoOneWayNav = id => {
    if (id === 'menu') {
      dispatch({ type: 'SET_OWNER_TAB', v: 'menu' });
      return;
    }
    setBestGoOneWayActive(id);
    if (typeof window !== 'undefined' && window.__bestGoOneWayNavigate) {
      window.__bestGoOneWayNavigate(id);
    }
  };

  useEffect(() => {
    if (!onBestGoOneWayManagement) {
      setBestGoOneWayActive('accept');
      return undefined;
    }
    const onSectionChange = (event) => {
      if (event?.detail) setBestGoOneWayActive(String(event.detail));
    };
    window.addEventListener('best-go-oneway-nav-active', onSectionChange);
    return () => window.removeEventListener('best-go-oneway-nav-active', onSectionChange);
  }, [onBestGoOneWayManagement]);

  const navLink = (label, page) => (
    <button
      onClick={() => dispatch({ type: 'SET_PAGE', v: page })}
      className={`text-sm font-medium transition-colors px-1 pb-0.5 border-b-2 ${
        frontendPage === page
          ? 'text-purple-700 border-purple-600'
          : 'text-gray-600 border-transparent hover:text-purple-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <header className="app-header fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => dispatch({ type: 'SET_PAGE', v: 'home' })}
            className="flex items-center gap-2.5"
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md">
              <img
                src="/logo.png"
                alt="BEST Car Rental"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold text-gray-900 text-base leading-tight block">BEST</span>
              <span className="text-purple-600 text-[10px] font-semibold tracking-widest uppercase leading-none">Car Rental</span>
            </div>
          </button>

          {/* Premium button moved to the center service-tab row on the home hero. */}

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {onOwnerDashboard ? (
              ownerShortcuts.map(s => (
                <button
                  key={s.id}
                  onClick={() => goOwnerTab(s.id)}
                  className={`text-sm font-medium transition-colors px-1 pb-0.5 border-b-2 ${
                    activeOwnerTab === s.id
                      ? 'text-purple-700 border-purple-600'
                      : 'text-gray-600 border-transparent hover:text-purple-700'
                  }`}
                >
                  {s.label}
                </button>
              ))
            ) : (
              <>
                {navLink(t('home'), 'home')}
                {isOwnerContext
                  ? navLink(t('ownerPortal'), 'owner-dashboard')
                  : navLink(t('search'), 'search')}
                {navLink(t('myPage'), 'mypage')}
              </>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <CurrencySwitcher />
            <LanguageSwitcher />

            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { dispatch({ type: 'SET_PAGE', v: 'mypage' }); window.__clearUnread?.(); }}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-md"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
                >
                  {(currentUser.name ?? currentUser.email ?? 'U').slice(0, 2).toUpperCase()}
                  {chatUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-0.5 leading-none">
                      {chatUnread > 9 ? '9+' : chatUnread}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => dispatch({ type: 'LOGOUT' })}
                  aria-label="Sign Out"
                  className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:text-gray-800 hover:border-gray-400 transition-colors hidden sm:block"
                >
                  {t('signOut')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => dispatch({ type: 'SET_AUTH', open: true, mode: 'login' })}
                className="text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-md hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                {t('signIn')}
              </button>
            )}
          </div>
        </div>
      </header>
      {/* Airbnb-style mobile tab bar — full width, line icons, active in brand colour */}
      <nav
        data-best-go-oneway-local-nav={onBestGoOneWayManagement ? true : undefined}
        className={`md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] inset-x-3 z-50 flex rounded-3xl border border-gray-200 bg-white/95 backdrop-blur-md shadow-xl ${
          onBestGoOneWayManagement ? 'gap-1 overflow-x-auto px-2 py-1.5' : ''
        }`}
      >
        {onOwnerDashboard ? (
          (onBestGoOneWayManagement ? bestGoOneWayShortcuts : ownerShortcuts).map(s => {
            const active = onBestGoOneWayManagement ? bestGoOneWayActive === s.id : activeOwnerTab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onBestGoOneWayManagement ? goBestGoOneWayNav(s.id) : goOwnerTab(s.id)}
                className={`relative flex select-none flex-col items-center gap-1 text-[10px] font-semibold transition-colors active:opacity-70 ${
                  onBestGoOneWayManagement ? 'min-w-[4.35rem] rounded-2xl px-2 py-1.5' : 'min-w-0 flex-1 py-2'
                } ${
                  active ? 'text-purple-700' : 'text-gray-500'
                }`}
              >
                <span className="relative leading-none">
                  <s.Icon />
                  {s.badge > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {s.badge > 9 ? '9+' : s.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            );
          })
        ) : (
          (() => {
            const onMyPage = frontendPage === 'mypage';
            const tabs = [
              { key: 'home',   label: t('home'),          Icon: IconHome,   active: frontendPage === 'home',
                onClick: () => dispatch({ type: 'SET_PAGE', v: 'home' }) },
              isOwnerContext
                ? { key: 'owner', label: t('ownerPortal'), Icon: IconOwner, active: frontendPage === 'owner-dashboard',
                    onClick: () => dispatch({ type: 'SET_PAGE', v: 'owner-dashboard' }) }
                : { key: 'search', label: t('search'),     Icon: IconSearch, active: frontendPage === 'search',
                    onClick: () => dispatch({ type: 'SET_PAGE', v: 'search' }) },
              { key: 'fav',    label: t('myFavorites'), Icon: IconHeart,  active: onMyPage && mypageTab === 'favorites',
                onClick: () => dispatch({ type: 'SET_MYPAGE_TAB', v: 'favorites' }) },
              { key: 'res',    label: t('myReservations'),    Icon: IconTrips,  active: onMyPage && mypageTab === 'reservations',
                onClick: () => dispatch({ type: 'SET_MYPAGE_TAB', v: 'reservations' }) },
              { key: 'msg',    label: t('myMessages'),  Icon: IconChat,   active: onMyPage && mypageTab === 'messages', badge: chatUnread,
                onClick: () => { dispatch({ type: 'SET_MYPAGE_TAB', v: 'messages' }); window.__clearUnread?.(); } },
            ];
            return tabs.map(tab => (
              <button
                key={tab.key}
                onClick={tab.onClick}
                className={`relative flex min-w-0 flex-1 select-none flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors active:opacity-70 ${
                  tab.active ? 'text-purple-700' : 'text-gray-500'
                }`}
              >
                <span className="relative leading-none">
                  <tab.Icon />
                  {tab.badge > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            ));
          })()
        )}
      </nav>
    </>
  );
}

function LegalModal({ pageKey, onClose }) {
  const { state } = useApp();
  const { t, locale } = useI18n();
  if (!pageKey) return null;
  const pages = state.legalPages ?? {};
  const titleKey = { privacy: 'privacyPolicy', terms: 'termsOfUse', contact: 'contactUs' }[pageKey];
  const content = pages[pageKey]?.[locale] ?? pages[pageKey]?.en ?? '';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xl hover:bg-gray-200">⊗</button>
        <div className="p-6">
          <h3 className="text-lg font-black text-gray-900 mb-4">{t(titleKey)}</h3>
          <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{content}</p>
          <button onClick={onClose} className="mt-6 w-full py-2.5 rounded-xl text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Airbnb-style stepped search (Location → Dates → Vehicle class) ───────────
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function MonthCalendar({ month, onPrev, onNext, start, end, onPick }) {
  const { locale } = useI18n();
  const y = month.getFullYear(), m = month.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDay = new Date(y, m, 1).getDay();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  const dow = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2023, 0, 1 + i)));
  const monthLabel = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(month);
  const inRange = (d) => start && end && d > start && d < end;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="h-8 w-8 rounded-full hover:bg-gray-100 text-gray-700 text-lg">‹</button>
        <p className="font-bold text-gray-900">{monthLabel}</p>
        <button onClick={onNext} className="h-8 w-8 rounded-full hover:bg-gray-100 text-gray-700 text-lg">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">
        {dow.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const past = d < today;
          const isStart = sameDay(d, start), isEnd = sameDay(d, end);
          const selected = isStart || isEnd;
          return (
            <button
              key={i}
              disabled={past}
              onClick={() => onPick(d)}
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm transition-colors ${
                past ? 'text-gray-300 line-through' :
                selected ? 'bg-gray-900 text-white font-bold' :
                inRange(d) ? 'bg-gray-100 text-gray-900' : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GuestSearchModal({ open, onClose }) {
  const { state, dispatch } = useApp();
  const { t, locale } = useI18n();
  const { serviceTab } = state;
  const [step, setStep] = useState('loc'); // 'loc' | 'date' | 'class'
  const [loc, setLoc] = useState('');
  const [airportCode, setAirportCode] = useState('');
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [cls, setCls] = useState('all');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [locating, setLocating] = useState(false);

  if (!open) return null;

  const clsLabel = (c) => (locale === 'ja' ? c.ja : c.label);
  const fmtDate = (d) => d ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d) : '';
  const dateSummary = start && end ? `${fmtDate(start)} – ${fmtDate(end)}` : start ? fmtDate(start) : (t('addDates'));
  const locSummary = loc || (t('searchDest'));
  const clsSummary = clsLabel(VEHICLE_CLASSES.find(c => c.id === cls) ?? VEHICLE_CLASSES[0]);

  const pickDay = (d) => {
    if (!start || (start && end) || d < start) { setStart(d); setEnd(null); }
    else if (sameDay(d, start)) { /* ignore */ }
    else setEnd(d);
  };

  const useNearby = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setLoc(t('nearbyLabel')); setAirportCode(''); setStep('date'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      let name = t('nearbyLabel');
      try {
        const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (addr) name = addr.replace(/^日本、?\s*/, '').replace(/〒?\d{3}-?\d{4}\s*/, '').split(',')[0].trim();
      } catch { /* keep default */ }
      setLoc(name); setAirportCode(''); setLocating(false); setStep('date');
    }, () => { setLocating(false); setLoc(t('nearbyLabel')); setAirportCode(''); setStep('date'); },
    { enableHighAccuracy: false, timeout: 8000 });
  };

  const reset = () => { setLoc(''); setAirportCode(''); setStart(null); setEnd(null); setCls('all'); setStep('loc'); };

  const runSearch = () => {
    dispatch({ type: 'SET_SEARCH', patch: {
      loc, airportCode, cls,
      pickup: start ? `${ymd(start)}T10:00` : '',
      ret: end ? `${ymd(end)}T10:00` : '',
      query: '',
    } });
    onClose();
  };

  const serviceLabel = (id) => ({ corporate: t('regularRental'), p2p: t('p2pShare'), parking: t('parking') }[id] ?? id);

  const CollapsedRow = ({ label, value, onClick }) => (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900 truncate ml-3">{value}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#f2f2f2]">
      {/* Top: service tabs + close */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2">
        <div className="flex gap-4">
          {SERVICE_TABS.map(tab => (
            <button key={tab.id} onClick={() => dispatch({ type: 'SET_SERVICE', v: tab.id })}
              className={`flex flex-col items-center gap-0.5 text-xs font-semibold ${serviceTab === tab.id ? 'text-gray-900' : 'text-gray-400'}`}>
              <span className="text-xl">{tab.icon}</span>
              <span className={serviceTab === tab.id ? 'border-b-2 border-gray-900 pb-0.5' : 'pb-0.5'}>{serviceLabel(tab.id)}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow text-gray-700 text-lg">✕</button>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* STEP 1 — Location */}
        {step === 'loc' ? (
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <h2 className="text-[22px] font-extrabold text-gray-900 mb-4">{t('stepLocation')}</h2>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                value={loc}
                onChange={e => { setLoc(e.target.value); setAirportCode(''); }}
                placeholder={t('searchDest')}
                className="w-full rounded-2xl border border-gray-300 bg-white py-4 pl-11 pr-4 text-[15px] text-gray-900 focus:outline-none focus:border-gray-900"
              />
            </div>
            <button onClick={useNearby} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-gray-50">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500 text-xl">➤</span>
              <span>
                <span className="block text-[15px] font-semibold text-gray-900">{locating ? (t('locating')) : (t('nearbyLabel'))}</span>
                <span className="block text-xs text-gray-500">{t('nearbySub')}</span>
              </span>
            </button>
            <p className="mt-4 mb-2 text-xs font-bold text-gray-500">{t('suggestedDest')}</p>
            <div className="max-h-64 overflow-y-auto -mx-1">
              {(JAPAN_AIRPORTS || []).map(ap => (
                <button key={ap.code}
                  onClick={() => { setAirportCode(ap.code); setLoc(`${ap.name ?? ap.nameEn} (${ap.code})`); setStep('date'); }}
                  className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-gray-50">
                  <span className="relative flex h-12 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-xl">
                    <span>{ap.emoji ?? '✈️'}</span>
                    <img
                      src={`/airports/${ap.code}.jpg`}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-gray-900">{locale === 'ja' ? (ap.name ?? ap.nameEn) : ap.nameEn}</span>
                    <span className="block truncate text-xs text-gray-500">{ap.city} · {ap.code}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <CollapsedRow label={t('stepLocation')} value={locSummary} onClick={() => setStep('loc')} />
        )}

        {/* STEP 2 — Dates */}
        {step === 'date' ? (
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <h2 className="text-[22px] font-extrabold text-gray-900 mb-4">{t('stepDates')}</h2>
            <MonthCalendar
              month={calMonth}
              onPrev={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
              onNext={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
              start={start} end={end} onPick={pickDay}
            />
            <button
              onClick={() => setStep('class')}
              disabled={!start}
              className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {t('next')}
            </button>
          </div>
        ) : (
          <CollapsedRow label={t('stepDates')} value={dateSummary} onClick={() => setStep('date')} />
        )}

        {/* STEP 3 — Vehicle class */}
        {step === 'class' ? (
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <h2 className="text-[22px] font-extrabold text-gray-900 mb-4">{t('stepClass')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {VEHICLE_CLASSES.map(c => (
                <button key={c.id} onClick={() => setCls(c.id)}
                  className={`overflow-hidden rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                    cls === c.id ? 'border-purple-600 ring-2 ring-purple-300 shadow-md' : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
                  }`}>
                  {c.img
                    ? <img src={c.img} alt="" loading="lazy"
                        className="h-28 w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <div className="flex h-28 w-full items-center justify-center bg-purple-50 text-4xl">{c.icon}</div>}
                  <div className={`px-3 py-3 ${cls === c.id ? 'bg-purple-50' : 'bg-white'}`}>
                    <span className="text-[15px] font-bold text-gray-900">{clsLabel(c)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <CollapsedRow label={t('stepClass')} value={clsSummary} onClick={() => setStep('class')} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <button onClick={reset} className="text-sm font-bold text-gray-900 underline underline-offset-2">{t('clearAll')}</button>
        <button onClick={runSearch}
          className="flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white"
          style={{ background: '#FF385C' }}>
          🔍 {t('searchBtn')}
        </button>
      </div>
    </div>
  );
}

export function HomePage() {
  const { state, dispatch } = useApp();
  const { serviceTab, vehicles: rawVehicles, reservations, owners = [], heroBanners, currentUser, dbReady } = state;
  // 起動直後のシード（デモ車）フラッシュを防ぐ：DBハイドレート完了までは車両を出さない
  const vehicles = dbReady ? rawVehicles : [];
  const [searchOpen, setSearchOpen] = useState(false);
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [loc, setLoc]     = useState('');
  const [pickup, setPickup] = useState('');
  const [ret, setRet]     = useState('');
  const [heroSlide, setHeroSlide] = useState(0);
  const [legalPage, setLegalPage] = useState(null);
  const [locOpen, setLocOpen] = useState(false);

  const handleSearch = () =>
    dispatch({ type: 'SET_SEARCH', patch: { query, loc, pickup, ret, cls: 'all', airportCode: '' } });

  const goBestGo = () => {
    window.scrollTo(0, 0);
    dispatch({ type: 'SET_PAGE', v: 'cross-return' });
  };

  // 空港を選んだら、その空港の近くの車を検索表示（airportCodeで絞り込み）
  const selectAirport = (ap) => {
    setLoc(`${ap.name ?? ap.nameEn} (${ap.code})`);
    setLocOpen(false);
    dispatch({ type: 'SET_SEARCH', patch: { airportCode: ap.code, cls: 'all', query: '', loc: '', pickup, ret } });
  };

  // 入力文字で空港候補を絞り込み（未入力なら全空港を表示）
  const airportMatches = (JAPAN_AIRPORTS || []).filter(a => {
    if (!loc.trim()) return true;
    const q = loc.trim().toLowerCase();
    return (
      a.code.toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q) ||
      (a.nameEn || '').toLowerCase().includes(q) ||
      (a.city || '').toLowerCase().includes(q)
    );
  });

  const banners = heroBanners?.length ? heroBanners : [];

  useEffect(() => {
    if (heroSlide >= banners.length) setHeroSlide(0);
  }, [banners.length, heroSlide]);

  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setHeroSlide(current => (current + 1) % banners.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [banners.length, heroSlide]);

  const featured = vehicles
    .filter(v => v.status === 'active' && (!v.approvalStatus || v.approvalStatus === 'approved'))
    .slice(0, 3);

  const rofListings = buildClassVirtualListings({
    vehicles, reservations, owners, pickup, ret, selectedClass: 'all',
  }).slice(0, 2);
  const serviceLabel = (id) => ({
    corporate: t('regularRental'),
    p2p: t('p2pShare'),
    parking: t('parking'),
  }[id] ?? id);
  const airportCity = (ap) => locale === 'ja' ? (ap.cityJa ?? ap.name ?? ap.city) : (ap.cityEn ?? ap.nameEn ?? ap.city);

  return (
    <div className="bg-white">
      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-screen flex flex-col pt-16 pt-appbar">
        {/* Banner carousel */}
        <div className="relative w-full flex-none bg-purple-50 md:flex-1 md:min-h-[600px]">
          {banners.map((banner, index) => (
            <img
              key={banner.src}
              src={banner.src}
              alt={banner.alt}
              className="absolute inset-x-0 top-0 h-[260px] w-full object-contain object-top transition-opacity duration-700 ease-out md:inset-0 md:h-full md:object-cover md:object-center"
              style={{
                opacity: heroSlide === index ? 1 : 0,
                transform: heroSlide === index ? 'scale(1)' : 'scale(1)',
              }}
            />
          ))}
          {/* Overlay for readability */}
          <div className="absolute inset-x-0 top-0 h-[260px] md:inset-0 md:h-auto"
               style={{ background: 'linear-gradient(to bottom, rgba(10,4,28,0.08) 0%, rgba(10,4,28,0.03) 46%, rgba(255,255,255,0.96) 100%)' }} />

          <button
            onClick={() => setHeroSlide(current => (current - 1 + banners.length) % banners.length)}
            aria-label={t('fa_prevBanner')}
            className={`hidden sm:flex absolute left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm border border-white/70 text-purple-700 text-2xl leading-none items-center justify-center shadow-md hover:bg-white transition-colors ${banners.length <= 1 ? 'opacity-0 pointer-events-none' : ''}`}
          >
            ‹
          </button>
          <button
            onClick={() => setHeroSlide(current => (current + 1) % banners.length)}
            aria-label={t('fa_nextBanner')}
            className={`hidden sm:flex absolute right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm border border-white/70 text-purple-700 text-2xl leading-none items-center justify-center shadow-md hover:bg-white transition-colors ${banners.length <= 1 ? 'opacity-0 pointer-events-none' : ''}`}
          >
            ›
          </button>

          <div className="absolute top-4 inset-x-0 flex justify-center gap-2 md:top-20">
            {banners.map((banner, index) => (
              <button
                key={banner.src}
                onClick={() => setHeroSlide(index)}
                aria-label={t('fa_showBanner').replace('{n}', index + 1)}
                className={`h-2.5 rounded-full border border-white/80 shadow-sm transition-all ${
                  heroSlide === index ? 'w-8 bg-white' : 'w-2.5 bg-white/55 hover:bg-white/85'
                }`}
              />
            ))}
          </div>

          {/* Search card overlay */}
          <div className="relative inset-x-0 z-10 px-4 pb-0 pt-[272px] md:absolute md:bottom-0 md:pt-0">
            <div className="max-w-5xl mx-auto">
              {/* Main search first — this is the primary path. */}
              <button
                onClick={() => setSearchOpen(true)}
                className="mx-auto mb-3 flex w-full max-w-xl items-center gap-3 rounded-full border border-gray-200 bg-white px-5 py-4 text-left shadow-xl transition-shadow hover:shadow-2xl md:mb-4"
              >
                <span className="text-lg">🔍</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-gray-900">
                    {state.searchParams?.loc || t('searchStart')}
                  </span>
                  <span className="block truncate text-xs text-gray-400">
                    {t('searchPillSub')}
                  </span>
                </span>
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>›</span>
              </button>

              {/* Best Match 導線（ヒーロー画像直下・目立つ位置） */}
              <div className="mx-auto mb-3 max-w-2xl">
                <OneWayBanner />
              </div>
              {/* 異地还车ブース導線 */}
              <div className="mx-auto mb-3 max-w-2xl">
                <button
                  type="button"
                  onClick={goBestGo}
                  className="group relative block w-full overflow-hidden rounded-3xl p-[1.5px] text-left shadow-lg active:scale-[0.99] transition-transform"
                  style={{ background: 'linear-gradient(120deg,#7c3aed,#a855f7,#c4b5fd)' }}
                >
                  <div className="relative flex items-center gap-3 rounded-[22px] bg-white px-4 py-3.5">
                    <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-purple-700 shadow-md ring-1 ring-purple-200">
                      <img src="/best-go-icon.png" alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[15px] font-black tracking-tight text-purple-700">{t('cr_boothTitle')}</span>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{t('cr_boothSub')}</p>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 ring-1 ring-purple-200 group-hover:bg-purple-100">{t('cr_bannerCta')} <span className="transition-transform group-hover:translate-x-0.5">›</span></span>
                  </div>
                </button>
              </div>
              {/* Badge */}
              <div className="flex justify-center mb-3 md:mb-4">
                <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-purple-200 text-purple-700 text-xs font-semibold px-3 py-2 rounded-full shadow-sm md:px-4">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {t('heroBadge')}
                </span>
              </div>

              {/* Service tabs — the Premium button sits in the center (where Car Share used to be) */}
              <div className="flex justify-center gap-2 mb-4 overflow-x-auto pb-1 md:mb-5 md:overflow-visible md:pb-0">
                {SERVICE_TABS.map((tab, i) => {
                  const midpoint = Math.floor(SERVICE_TABS.length / 2);
                  const tabBtn = (
                    <button key={tab.id}
                      onClick={() => dispatch({ type: 'SET_SERVICE', v: tab.id })}
                      className={`flex flex-shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all shadow-sm md:px-4 ${
                        serviceTab === tab.id
                          ? 'text-white border-purple-600 shadow-purple-200'
                          : 'bg-white/80 backdrop-blur-sm text-gray-600 border-gray-200 hover:border-purple-300'
                      }`}
                      style={serviceTab === tab.id ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)' } : {}}
                    >
                      {tab.icon} {serviceLabel(tab.id)}
                    </button>
                  );
                  if (i === midpoint) {
                    return (
                      <React.Fragment key={tab.id}>
                        <a
                          href="https://bestcarrentalpremium.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold text-[#3a2b00] shadow-md transition-transform hover:brightness-105 active:scale-95 md:px-4"
                          style={{ background: 'linear-gradient(135deg, #d4af37, #f6d365)' }}
                        >
                          <span>👑</span>
                          <span>Premium</span>
                        </a>
                        {tabBtn}
                      </React.Fragment>
                    );
                  }
                  return tabBtn;
                })}
              </div>

            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-white border-b border-purple-100">
          <div className="max-w-5xl mx-auto px-4 pt-3 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              {[
                { icon: '🌐', num: '50+', label: t('countries') },
                { icon: '🚗', num: '10,000+', label: t('vehicleCount') },
                { icon: '⭐', num: '4.9', label: t('averageRating') },
                { icon: '🔒', num: '24/7', label: t('support') },
              ].map(s => (
                <div key={s.label} className="text-center py-3">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-xl font-black text-purple-700">{s.num}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── RUN-OF-FLEET HIGHLIGHT ──────────────────────────────── */}
      {rofListings.length > 0 && (
        <section className="py-16 px-4 bg-gradient-to-b from-white to-purple-50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full mb-2">
                  ✨ {t('recommended')}
                </span>
                <h2 className="text-2xl font-black text-gray-900">{t('runOfFleetTitle')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('runOfFleetSubtitle')}</p>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET_SEARCH', patch: { cls: 'all', query: '', pickup, ret } })}
                className="text-sm font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1"
              >
                {t('viewAll')} →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {rofListings.map(v => <RunOfFleetCard key={v.id} vehicle={v} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED VEHICLES ───────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="py-16 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="inline-block bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full mb-2">
                  🚗 {t('featuredBadge')}
                </span>
                <h2 className="text-2xl font-black text-gray-900">{t('featuredVehicles')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('featuredSubtitle')}</p>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET_SEARCH', patch: { cls: 'all', query: '' } })}
                className="text-sm font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1"
              >
                {t('viewAll')} →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featured.map(v => <VehicleCard key={v.id} vehicle={v} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── AIRPORT SECTION ─────────────────────────────────────── */}
      <section className="py-16 px-4 bg-purple-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full mb-2">
              ✈️ {t('airportTransfer')}
            </span>
            <h2 className="text-2xl font-black text-gray-900 mb-2">{t('airportSearch')}</h2>
            <p className="text-gray-500 text-sm">{t('airportSearchSub')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(JAPAN_AIRPORTS || []).map(ap => (
              <AirportCard
                key={ap.code}
                ap={ap}
                city={airportCity(ap)}
                onClick={() => dispatch({ type: 'SET_SEARCH', patch: { airportCode: ap.code, cls: 'all', query: '' } })}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full mb-3">
            {t('howItWorksBadge')}
          </span>
          <h2 className="text-2xl font-black text-gray-900 mb-10">{t('howItWorksTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '🔍', title: t('stepChooseVehicleTitle'), desc: t('stepChooseVehicleBody') },
              { step: '2', icon: '💳', title: t('stepPayTitle'), desc: t('stepPayBody') },
              { step: '3', icon: '🚗', title: t('stepDriveTitle'), desc: t('stepDriveBody') },
            ].map(s => (
              <div key={s.step} className="relative flex flex-col items-center gap-4 p-6 rounded-2xl border border-purple-100 bg-purple-50/50">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg shadow-md"
                     style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                  {s.step}
                </div>
                <div className="text-3xl">{s.icon}</div>
                <h3 className="text-gray-900 font-bold">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="bg-gray-900 border-t border-gray-800 pt-10 px-4 pb-app-nav md:pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden">
                <img src="/logo.png" alt="BEST Car Rental" className="w-full h-full object-cover" />
              </div>
              <span className="text-white font-bold text-sm">BEST Car Rental</span>
            </div>
            <p className="text-gray-500 text-sm">© 2025 Best Car Rental. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-gray-500">
              <button onClick={() => setLegalPage('privacy')} className="hover:text-white transition-colors">{t('privacy')}</button>
              <button onClick={() => setLegalPage('terms')} className="hover:text-white transition-colors">{t('terms')}</button>
              <button onClick={() => setLegalPage('contact')} className="hover:text-white transition-colors">{t('contact')}</button>
            </div>
          </div>

          {/* オーナー / 管理者向けの入口（フッター下部に配置） */}
          <div className="mt-8 pt-6 border-t border-gray-800 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => { dispatch({ type: 'SET_PAGE', v: currentUser ? 'owner-dashboard' : 'owner-register' }); window.scrollTo(0, 0); }}
              className="text-xs text-emerald-300 border border-emerald-800 rounded-lg px-3 py-1.5 hover:bg-emerald-900/30 transition-colors"
            >
              🏪 {currentUser ? t('ownerPortal') : t('ownerRegister')}
            </button>
            {(currentUser?.role === 'admin' || currentUser?.isMaster) && (
              <button
                onClick={() => {
                  if (currentUser?.isMaster) dispatch({ type: 'SET_ADMIN_TAB', v: 'master' });
                  dispatch({ type: 'SET_MODE', v: 'admin' });
                }}
                className="text-xs text-purple-300 border border-purple-800 rounded-lg px-3 py-1.5 hover:bg-purple-900/30 transition-colors"
              >
                {currentUser?.isMaster ? '★ Master' : 'Admin'}
              </button>
            )}
          </div>
        </div>
      </footer>

      <LegalModal pageKey={legalPage} onClose={() => setLegalPage(null)} />
      <GuestSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

// ── 空港カード（バナー画像ボタン）───────────────────────────────────────────
// バナー画像は public/airports/{CODE}.jpg（例: /airports/FUK.jpg）に置く。
// 画像が無い/読み込み失敗時は絵文字カードに自動フォールバックする。
function AirportCard({ ap, city, onClick }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <button onClick={onClick} className="group block w-full text-left" aria-label={`${ap.code} ${ap.nameEn ?? ap.name}`}>
      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-purple-300 group-hover:shadow-xl group-active:scale-[0.99]">
        {imgOk ? (
          <img
            src={`/airports/${ap.code}.jpg`}
            alt={`${ap.code} — ${ap.nameEn ?? ap.name}`}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-purple-100 via-white to-purple-50">
            <span className="text-4xl">{ap.emoji ?? '✈️'}</span>
            <span className="text-xl font-black text-purple-700">{ap.code}</span>
            <span className="text-[11px] text-gray-500">{city}</span>
          </div>
        )}
        {/* ホバー時に下部へCTA（画像内の文字とは干渉しない控えめなオーバーレイ） */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/50 via-black/10 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="text-xs font-bold text-white drop-shadow">{city}</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-sm font-bold text-purple-700 shadow">→</span>
        </div>
      </div>
    </button>
  );
}

export function SearchPage() {
  return (
    <div className="pt-appbar min-h-screen flex flex-col bg-gray-50">
      <MapSearch />
    </div>
  );
}

export function VehicleCard({ vehicle: v }) {
  const { state, dispatch } = useApp();
  const { currentUser } = state;
  const { t } = useI18n();
  const { currency, format } = useCurrency();

  const openBooking = () => {
    addRecentlyViewed(v.id);
    if (!currentUser) {
      dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
      dispatch({ type: 'TOAST', msg: t('authRequiredBooking') });
      return;
    }
    const profile = currentUser.bookingProfile ?? {};
    dispatch({
      type: 'SET_BOOKING',
      b: {
        vehicleId: v.id, vehicle: v,
        bookingType: 'specific',
        step: 1, type: v.type,
        pickup: '', ret: '', opts: {},
        guestName: '',
        info: {
          name: currentUser?.name ?? '',
          email: currentUser?.email ?? '',
          phone: currentUser?.phone || profile.phone || '',
          nat: profile.nat ?? currentUser?.nat ?? '',
          license: profile.license ?? currentUser?.license ?? '',
          idpExpiresOn: profile.idpExpiresOn ?? '',
          idpFileName: profile.idpFileName ?? '',
          idpFileDataUrl: profile.idpFileDataUrl ?? '',
          channels: profile.channels ?? [],
          contactHandles: profile.contactHandles ?? {},
        },
      },
    });
  };

  const largeSuitcases = Number(v.largeSuitcases ?? v.large_suitcases ?? 0);
  const smallBags = Number(v.smallBags ?? v.small_bags ?? 0);
  const isPartner = Boolean(v.deliveryAvailable ?? v.crossRegion ?? v.partnerDelivery);
  const etaHours = Number(v.deliveryEtaHours ?? v.advanceHours ?? 0);
  const oneWay = Boolean(v.oneWayReturn ?? v.oneway ?? v.allowOneWay ?? v.oneWayEnabled);
  const chatOwnerId = v.ownerId ?? v.owner_id ?? v.ownerAuthId ?? v.owner_auth_id ?? null;
  const canPreBookingChat = Boolean(v.preBookingChatEnabled ?? v.pre_booking_chat_enabled) && Boolean(chatOwnerId);
  const openChat = (e) => {
    e.stopPropagation();
    if (!currentUser) { dispatch({ type: 'SET_AUTH', open: true, mode: 'login' }); return; }
    if (!canPreBookingChat) { dispatch({ type: 'TOAST', msg: t('ownerChatUnavailable') }); return; }
    window.__openChat?.({ ...v, ownerId: chatOwnerId, img_url: v.img_url ?? v.img });
  };

  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white overflow-hidden hover:border-purple-300 hover:shadow-lg hover:shadow-purple-100/50 transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
      onClick={openBooking}
    >
      <div className="relative overflow-hidden h-48 bg-gradient-to-b from-gray-100 to-gray-200">
        <img
          src={v.img || 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80'}
          alt={`${v.maker} ${v.model}`}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
        {v.badge && (
          <span className="absolute top-3 left-3 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md"
                style={{ background: v.badgeBg || '#7c3aed' }}>
            {v.badge}
          </span>
        )}
        <FavButton id={v.id} className="absolute top-2.5 right-2.5" />
        <span className="absolute top-3.5 right-14 bg-black/50 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-lg">
          {v.type === 'p2p' ? 'P2P' : t('rentalCar')}
        </span>
        <div className="absolute bottom-3 left-3 flex items-center gap-1">
          <span className="text-yellow-400 text-xs">★</span>
          <span className="text-white text-xs font-semibold">{v.rating}</span>
          <span className="text-gray-300 text-xs">({v.reviews})</span>
        </div>
      </div>

      <div className="p-4">
        {/* 本地 / 加盟店送車 / 异地还车 タグ */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {isPartner ? (
            <span className="rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
              🚚 {t('tagPartnerCar')}{etaHours > 0 ? ` · ${t('advanceBookingHours').replace('{h}', etaHours)}` : ''}
            </span>
          ) : (
            <span className="rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold">
              ✅ {t('tagLocalCar')}
            </span>
          )}
          {oneWay && (
            <span className="rounded-md bg-purple-100 text-purple-800 border border-purple-300 px-2 py-0.5 text-[10px] font-bold">
              ↔ {t('oneWayReturnAvailable')}
            </span>
          )}
          {canPreBookingChat && (
            <span className="rounded-md bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 text-[10px] font-bold">
              💬 {t('askBeforeBooking')}
            </span>
          )}
        </div>
        <h3 className="text-gray-900 font-bold text-base">{v.maker} {v.model}</h3>
        <p className="text-gray-500 text-xs mb-3">{v.year}{t('fa_yearSuffix')} · {v.grade}</p>
        {isPartner && etaHours > 0 && (
          <p className="text-amber-600 text-xs font-semibold mb-2">⏱ {t('deliveryEtaHours').replace('{h}', etaHours)}</p>
        )}
        <div className="flex gap-3 text-xs text-gray-500 mb-3">
          <span>👤 {v.pax}</span>
          <span>⛽ {v.fuel}</span>
          <span>⚙️ {v.trans}</span>
          <span>📍 {v.loc?.split(',')[0]}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {v.tags?.slice(0, 3).map(tag => (
            <span key={tag} className="text-[11px] bg-purple-50 border border-purple-100 text-purple-700 rounded-lg px-2 py-0.5">{tag}</span>
          ))}
        </div>
        {(largeSuitcases > 0 || smallBags > 0) && (
          <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-800">
            <div className="font-bold">🧳 Luggage capacity at max passengers</div>
            <div>Large Suitcase: {largeSuitcases} / Small Bag: {smallBags}</div>
          </div>
        )}
        {v.holder && (
          <div className="flex items-center gap-2 mb-3 p-2.5 bg-gray-50 border border-gray-100 rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {v.holder.av}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-xs font-medium">{v.holder.name}</p>
              <p className="text-gray-400 text-xs">★ {v.holder.rating} · {v.holder.resp} resp.</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <span className="text-gray-900 font-black text-xl">{format(v.priceDay)}</span>
            <span className="text-gray-400 text-xs">{t('perDay')}</span>
            {currency !== 'JPY' && (
              <span className="block text-gray-400 text-xs">¥{v.priceDay?.toLocaleString()}</span>
            )}
            <p className="text-gray-400 text-xs">🛡 {t('ins_selectableBadge')}</p>
          </div>
          <div className="flex items-center gap-2">
            {canPreBookingChat && (
              <button
                onClick={openChat}
                className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
              >
                💬 {t('askOwnerCta')}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); openBooking(); }}
              className="px-4 py-2 text-xs rounded-xl text-white font-bold hover:brightness-110 transition-all shadow-sm"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
            >
              {t('bookNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParkingCard({ spot: p }) {
  const { state, dispatch } = useApp();
  const { theme } = state;
  const { format } = useCurrency();
  return (
    <div className="rounded-2xl border border-gray-800 overflow-hidden hover:border-gray-600 transition-all" style={{ background: theme.cardBg }}>
      <img src={p.img} alt={p.name} className="w-full h-40 object-cover" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-white font-bold">{p.name}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.available > 0 ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>{p.available}/{p.total} spaces</span>
        </div>
        <p className="text-gray-400 text-sm mb-3">📍 {p.addr}</p>
        <div className="flex gap-3 text-xs text-gray-400 mb-3"><span>↕ {p.height}m</span><span>↔ {p.width}m</span><span>↔ {p.length}m</span></div>
        <div className="flex flex-wrap gap-1.5 mb-4">{p.tags?.map(t => <Tag key={t}>{t}</Tag>)}</div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-white font-bold">{format(p.priceHour)}</span><span className="text-gray-400 text-xs">/hr</span>
            <p className="text-gray-500 text-xs">{format(p.priceDay)}/day</p>
          </div>
          <GradBtn theme={theme} className="px-4 py-2 text-xs" onClick={() => dispatch({ type: 'TOAST', msg: 'Parking reservation coming soon!' })}>Reserve</GradBtn>
        </div>
      </div>
    </div>
  );
}

export default function FrontendApp() {
  const { state, dispatch } = useApp();
  const { frontendPage, currentUser, ownerOnboardingMode } = state;
  const { locale, t } = useI18n();
  const [chatVehicle, setChatVehicle] = React.useState(null);
  const lastChatVehicleRef = React.useRef(null); // 直近の新着メッセージの車両ID（トーストのタップ先）
  const lastToastedCountRef = React.useRef(0);   // 同じ未読件数で何度もトーストしないためのガード

  // VehicleCard からチャットを開けるようにグローバル公開
  React.useEffect(() => {
    window.__openChat = (v) => setChatVehicle(v);
    return () => { delete window.__openChat; };
  }, []);

  // iOS / Android ネイティブ機能（スプラッシュ・ステータスバー・戻るボタン）を初期化
  // Web では自動的に no-op になる
  React.useEffect(() => {
    import('../lib/native').then(m => m.initNative()).catch(() => {});
  }, []);

  // Stripe Checkout（Apple Pay / Google Pay）からの復帰を検知してトースト表示
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (!status) return;
    if (status === 'success') {
      dispatch({ type: 'TOAST', msg: t('pay_checkoutSuccess') });
      dispatch({ type: 'SET_PAGE', v: 'mypage' });
    } else if (status === 'cancel') {
      dispatch({ type: 'TOAST', msg: t('pay_checkoutCancel') });
    }
    // クエリを消してリロード時の再表示を防ぐ
    params.delete('checkout');
    params.delete('res');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 借りる側: 未読メッセージ数ポーリング ＋ アプリ内トースト
  React.useEffect(() => {
    if (!currentUser?.id || currentUser.role === 'owner') return;
    const fetchUnread = async () => {
      try {
        const res  = await fetch(`/api/chat/unread?userId=${currentUser.id}&role=user`);
        const data = await res.json();
        const newCount = data.count ?? 0;
        const prev = state.chatUnread ?? 0;
        // 件数が増えた & まだ通知していない件数のときだけトースト（再表示ループ防止）
        if (newCount > prev && newCount > lastToastedCountRef.current) {
          lastToastedCountRef.current = newCount;
          // アプリ内トースト（OS通知が無効でも気づける）— タップで受信箱を開く
          dispatch({ type: 'TOAST', msg: t('fa_newMsgFromOwner').replace('{n}', newCount), action: { kind: 'inbox' } });
          // OS通知（許可済みのとき）
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(t('fa_notifOwnerReplied'), {
              body: t('fa_unreadCount').replace('{n}', newCount), icon: '/favicon.ico',
            });
          }
        }
        // 既読等で件数が減ったらガードもリセット（次の増加で再通知できるように）
        if (newCount < lastToastedCountRef.current) lastToastedCountRef.current = newCount;
        dispatch({ type: 'SET_CHAT_UNREAD', count: newCount });
      } catch {}
    };
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    fetchUnread();
    const timer = setInterval(fetchUnread, 15000);

    // リアルタイム購読: 送信側のbroadcastを受けて即トースト＋未読更新
    let channel = null;
    try {
      channel = supabase
        .channel(`notify:${currentUser.id}`)
        .on('broadcast', { event: 'new_message' }, (payload) => {
          const vId = payload?.payload?.vehicleId ?? null;
          if (vId != null) lastChatVehicleRef.current = vId;
          dispatch({ type: 'TOAST', msg: t('fa_newMsgArrived'), action: { kind: 'inbox' } });
          fetchUnread();
        })
        .on('broadcast', { event: 'new_review' }, (payload) => {
          const message = payload?.payload?.message ?? t('fa_reviewNotif');
          dispatch({ type: 'TOAST', msg: message, action: { kind: 'review' } });
        })
        .subscribe();
    } catch (_) {}

    return () => { clearInterval(timer); if (channel) supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  // チャットを開いたら未読クリア
  React.useEffect(() => {
    window.__clearUnread = () => dispatch({ type: 'SET_CHAT_UNREAD', count: 0 });
  }, [dispatch]);

  return (
    <>
      <AppLoader />
      <Navbar />
      {frontendPage === 'home'            && <HomePage />}
      {frontendPage === 'one-way'         && <OneWayPage />}
      {frontendPage === 'cross-return'    && <CrossReturnBooth />}
      {frontendPage === 'search'          && <SearchPage />}
      {frontendPage === 'mypage'          && <MyPage />}
      {frontendPage === 'owner-dashboard' && <OwnerDashboard />}
      {frontendPage === 'owner-register'  && (
        <div className="min-h-screen pt-appbar-lg pb-app-nav" style={{ background: '#0a0a0f' }}>
          {!currentUser && (
            <div className="max-w-2xl mx-auto px-4 pt-4">
              <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-4 flex items-start gap-3 mb-6">
                <span className="text-yellow-400 text-xl">⚠️</span>
                <div>
                  <p className="text-yellow-300 font-semibold text-sm">{t('fa_loginRequired')}</p>
                  <p className="text-yellow-200/70 text-xs mt-1">{t('fa_merchantLoginNote')}</p>
                  <button onClick={() => dispatch({ type: 'SET_AUTH', open: true, mode: 'login' })}
                    className="mt-2 text-xs text-yellow-300 underline hover:text-yellow-100">{t('fa_loginOrSignup')}</button>
                </div>
              </div>
            </div>
          )}
          <OwnerOnboarding
            mode={ownerOnboardingMode}
            onClose={() => dispatch({ type: 'SET_PAGE', v: 'owner-dashboard' })}
          />
        </div>
      )}
      <BookingModal />
      {chatVehicle && (
        <ChatModal
          open={!!chatVehicle}
          onClose={() => setChatVehicle(null)}
          vehicle={chatVehicle}
          currentUser={currentUser}
          targetLang={locale}
        />
      )}
    </>
  );
}
