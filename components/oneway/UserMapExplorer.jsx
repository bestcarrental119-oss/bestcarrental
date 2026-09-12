'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18nContext';
import { loadGoogleMaps, hasGoogleMapsKey, geocodeAddress, reverseGeocode } from '../../lib/googleMaps';
import {
  areaPresetLabel,
  filterRouteSearchCandidates,
  ONE_WAY_AREA_PRESETS,
  pinStatus,
  PIN_COLORS,
  resolveAreaPreset,
  routeRentalBaseAmount,
  routeRentalDays,
  searchRouteListings,
  spreadRoutePoints,
} from '../../lib/oneWay';
import { VEHICLE_CLASSES } from '../../lib/data';
import { normalizeVehicleClass } from '../../lib/runOfFleet';

const yen = n => `¥${Number(n || 0).toLocaleString()}`;

// 白×紫のサイバーマップ：ほぼ白の下地に、紫のライン。シンプルで直感的。
const CYBER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f6f4ff' }] },              // 陸（ほぼ白の淡いラベンダー）
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b21b6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d6ccff' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#7c3aed' }] }, // 国境＝紫
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#c4b5fd' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#6d28d9' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#faf8ff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#efeaff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c4b5fd' }] },   // 高速＝ライトパープル
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#7c3aed' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e6e2ff' }] },          // 水域＝淡いインディゴ
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6d28d9' }] },
];

// 埋め込みCSS：装飾は最小限（うっすら紫の緯線経線のみ）
const CYBER_CSS = `
.ow-grid{position:absolute;inset:0;pointer-events:none;opacity:.05;
  background-image:linear-gradient(rgba(124,58,237,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,.5) 1px,transparent 1px);
  background-size:56px 56px}
`;

function RouteListingCard({ listing, selected, t, search, rentalDays, onSelect, onReserve }) {
  const status = pinStatus(listing);
  const rentalBaseAmount = routeRentalBaseAmount(listing, search);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex w-full min-w-[82%] max-w-[360px] flex-shrink-0 snap-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99] md:min-w-0 md:max-w-none ${
        selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-100 hover:border-purple-300'
      }`}
    >
      {listing.img
        ? <img src={listing.img} alt="" className="h-16 w-24 flex-shrink-0 rounded-xl object-cover ring-1 ring-purple-100" />
        : <span className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100 text-3xl">🚗</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ background: PIN_COLORS[status] }}>
                {status === 'now' ? t('ow_availableNow') : t('ow_upcoming')}
              </span>
              <span className="truncate text-sm font-black text-gray-900">{listing.maker} {listing.model}</span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-600">
              {listing.from?.name} <span className="text-purple-600">→</span> {listing.to?.name}
            </p>
            <p className="text-xs text-gray-500">
              {t('ow_baseFee')}: <span className="font-bold text-gray-900">{rentalBaseAmount > 0 ? yen(rentalBaseAmount) : t('ow_free')}</span>
              {rentalDays > 1 ? <> · {rentalDays}d</> : null}
              {listing.distanceKm != null ? <> · {listing.distanceKm}km</> : null}
            </p>
            {listing.baseFee > 0 && (
              <p className="text-xs text-gray-500">
                {t('cr_baseFee')}: <span className="font-bold text-purple-700">{yen(listing.baseFee)}</span>
              </p>
            )}
          </div>
        </div>
        {(listing.routeSearch?.pickupDistanceKm != null || listing.routeSearch?.returnDistanceKm != null) && (
          <p className="mt-1 text-[11px] font-semibold text-purple-700">
            {listing.routeSearch?.pickupDistanceKm != null && fill(t('ow_pickupDistance'), { d: fmtKm(listing.routeSearch.pickupDistanceKm) })}
            {listing.routeSearch?.pickupDistanceKm != null && listing.routeSearch?.returnDistanceKm != null ? ' · ' : ''}
            {listing.routeSearch?.returnDistanceKm != null && fill(t('ow_returnDistance'), { d: fmtKm(listing.routeSearch.returnDistanceKm) })}
          </p>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReserve(listing); }}
          className="mt-2 w-full rounded-xl bg-purple-700 px-3 py-2.5 text-sm font-black text-white shadow-[0_6px_18px_rgba(124,58,237,0.25)]"
        >
          {t('ow_viewDetail')} →
        </button>
      </div>
    </div>
  );
}

function RouteResultsPanel({ listings, selected, t, search, onSelect, onReserve, onClear }) {
  const railRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedId = selected ? String(selected.id) : '';
  const selectedIndex = listings.findIndex(listing => String(listing.id) === selectedId);
  const rentalDays = routeRentalDays(search);
  const clampIndex = (index) => Math.max(0, Math.min(listings.length - 1, index));
  const scrollToCard = (index) => {
    const card = railRef.current?.children?.[index];
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  const goResultCard = (index) => {
    const next = clampIndex(index);
    const listing = listings[next];
    if (!listing) return;
    setActiveIndex(next);
    onSelect(listing);
    window.setTimeout(() => scrollToCard(next), 0);
  };

  useEffect(() => {
    if (!listings.length) return;
    const next = selectedIndex >= 0 ? selectedIndex : Math.min(activeIndex, listings.length - 1);
    setActiveIndex(next);
    scrollToCard(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedIndex, listings.length]);

  const handleRailScroll = () => {
    const rail = railRef.current;
    if (!rail?.children?.length) return;
    const next = Array.from(rail.children).reduce((best, child, index) => {
      const distance = Math.abs(child.offsetLeft - rail.scrollLeft);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Infinity }).index;
    setActiveIndex(next);
  };

  if (!listings.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-purple-200 bg-white p-3 shadow-[0_8px_24px_rgba(124,58,237,0.12)]">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900">{t('ow_resultsListTitle')}</p>
          <p className="truncate text-[11px] font-semibold text-purple-700">
            {fill(t('ow_routeMatched'), { n: listings.length })}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => goResultCard(activeIndex - 1)}
            disabled={activeIndex <= 0}
            aria-label="previous result car"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-lg font-black text-purple-700 shadow-sm active:scale-95 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            ‹
          </button>
          <span className="min-w-[3.5rem] rounded-full bg-gray-900 px-2.5 py-1 text-center text-[11px] font-black text-white">
            {activeIndex + 1} / {listings.length}
          </span>
          <button
            type="button"
            onClick={() => goResultCard(activeIndex + 1)}
            disabled={activeIndex >= listings.length - 1}
            aria-label="next result car"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-lg font-black text-purple-700 shadow-sm active:scale-95 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300"
          >
            ›
          </button>
        </div>
        {selected && (
          <button
            type="button"
            onClick={onClear}
            aria-label="clear selected car"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
          >
            ✕
          </button>
        )}
      </div>
      <div
        ref={railRef}
        onScroll={handleRailScroll}
        className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain pb-2 pr-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0"
      >
        {listings.map(listing => (
          <RouteListingCard
            key={listing.id}
            listing={listing}
            selected={selectedId === String(listing.id)}
            t={t}
            search={search}
            rentalDays={rentalDays}
            onSelect={() => onSelect(listing)}
            onReserve={onReserve}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5 md:hidden">
        {listings.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goResultCard(index)}
            aria-label={`show result car ${index + 1}`}
            className={`h-2 rounded-full transition-all active:scale-95 ${
              index === activeIndex ? 'w-6 bg-purple-700' : 'w-2 bg-purple-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// from→to のアーチ状の点列（2次ベジェ）
function arcPoints(from, to, n = 72) {
  const { lat: y1, lng: x1 } = from;
  const { lat: y2, lng: x2 } = to;
  const dx = y2 - y1, dy = x2 - x1;
  const dist = Math.hypot(dx, dy) || 1;
  const off = dist * 0.24;
  const cLat = (y1 + y2) / 2 + (-dy) / dist * off;
  const cLng = (x1 + x2) / 2 + (dx) / dist * off;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lat = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cLat + t ** 2 * y2;
    const lng = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cLng + t ** 2 * x2;
    pts.push({ lat, lng });
  }
  return pts;
}

// 上から見た車のSVGパス（上=北=進行方向、原点中心）
const CAR_ICON_PATH = 'M-5,-8 Q-5,-10 -3,-10 L3,-10 Q5,-10 5,-8 L5,-3 L7,-2 L7,1 L5,2 L5,8 Q5,10 3,10 L-3,10 Q-5,10 -5,8 L-5,2 L-7,1 L-7,-2 L-5,-3 Z';

// 2点間の進行方位（度・北=0・時計回り）。Symbol の rotation に対応。
function headingDeg(a, b) {
  const dLat = b.lat - a.lat;
  const dLng = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

const FEATURED_AREA_IDS = [
  'kix', 'osaka-umeda', 'namba', 'shin-osaka', 'kyoto-station', 'nara-station',
  'kobe-sannomiya', 'usj', 'tokyo-station', 'narita-airport', 'fukuoka-airport',
  'hokkaido-sapporo',
];

const fmtKm = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString();
};

const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);

function pointFromPreset(preset, locale) {
  return { id: preset.id, name: areaPresetLabel(preset, locale), lat: preset.lat, lng: preset.lng };
}

const todayValue = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
};

const monthValueFromDate = (value) => String(value || todayValue()).slice(0, 7);

const addMonthsToMonth = (monthValue, delta) => {
  const [year, month] = monthValue.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatCalendarMonth = (monthValue, locale) => {
  const [year, month] = monthValue.split('-').map(Number);
  const tag = locale === 'ja' ? 'ja-JP' : locale;
  return new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1));
};

const weekdayLabels = (locale) => {
  if (locale === 'ja') return ['日', '月', '火', '水', '木', '金', '土'];
  if (locale === 'ko') return ['일', '월', '화', '수', '목', '금', '토'];
  if (locale?.startsWith('zh')) return ['日', '一', '二', '三', '四', '五', '六'];
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
};

const buildCalendarMonth = (monthValue, minDate) => {
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, (_, index) => ({ key: `blank-${index}`, blank: true }));
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { key: value, value, day, disabled: value < minDate };
  });
  return [...blanks, ...days];
};

const displayClassLabel = (cls, locale) => {
  const normalized = cls === 'all' ? 'all' : normalizeVehicleClass(cls);
  const row = VEHICLE_CLASSES.find(c => c.id === normalized) ?? VEHICLE_CLASSES[0];
  return locale === 'ja' ? row.ja : row.label;
};

export default function UserMapExplorer({ listings = [], onReserve }) {
  const { t, locale } = useI18n();
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeLinesRef = useRef([]);
  const locationMapDiv = useRef(null);
  const locationMapRef = useRef(null);
  const locationMarkersRef = useRef([]);
  const locationClickListenerRef = useRef(null);
  const pickupInputRef = useRef(null);
  const returnInputRef = useRef(null);
  const activeTargetRef = useRef('pickup');
  const glowRef = useRef(null);   // 下地のネオン太線
  const arcRef = useRef(null);    // 本線
  const carRef = useRef(null);    // ルートを走る車
  const arcTimer = useRef(null);
  const travelTimer = useRef(null);
  const colorTimer = useRef(null);
  const pulseTimer = useRef(null);
  const [selected, setSelected] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [locationMapReady, setLocationMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(!hasGoogleMapsKey());
  const [pickupText, setPickupText] = useState('');
  const [returnText, setReturnText] = useState('');
  const [pickupPoint, setPickupPoint] = useState(null);
  const [returnPoint, setReturnPoint] = useState(null);
  const [activeTarget, setActiveTarget] = useState('pickup');
  const [routeSearching, setRouteSearching] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [flowStep, setFlowStep] = useState('location');
  const [showResults, setShowResults] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => monthValueFromDate(todayValue()));
  const [selectedClass, setSelectedClass] = useState('all');

  useEffect(() => { activeTargetRef.current = activeTarget; }, [activeTarget]);

  const candidateListings = useMemo(
    () => filterRouteSearchCandidates(listings, { selectedClass, pickupDate, returnDate }),
    [listings, selectedClass, pickupDate, returnDate],
  );
  const routeResult = useMemo(
    () => searchRouteListings(candidateListings, { pickupPoint, returnPoint }),
    [candidateListings, pickupPoint, returnPoint],
  );
  const visibleListings = routeResult.listings;
  const pickupMarkerPoints = useMemo(() => spreadRoutePoints(visibleListings, 'from'), [visibleListings]);
  const returnMarkerPoints = useMemo(() => spreadRoutePoints(visibleListings, 'to'), [visibleListings]);
  const hasRouteFilter = Boolean(pickupPoint || returnPoint);
  const hasSearchFilter = Boolean(pickupPoint || returnPoint || pickupDate || returnDate || selectedClass !== 'all');
  const featuredPresets = useMemo(
    () => FEATURED_AREA_IDS.map(id => ONE_WAY_AREA_PRESETS.find(p => p.id === id)).filter(Boolean),
    [],
  );
  const dateSelectionComplete = Boolean(pickupDate && returnDate && returnDate > pickupDate);

  const clearArc = () => {
    [arcTimer, travelTimer, colorTimer].forEach(r => { if (r.current) { clearInterval(r.current); r.current = null; } });
    [glowRef, arcRef, carRef].forEach(r => { if (r.current) { r.current.setMap(null); r.current = null; } });
  };

  const clearRouteLines = () => {
    routeLinesRef.current.forEach(line => line.setMap(null));
    routeLinesRef.current = [];
  };

  const clearLocationMarkers = () => {
    locationMarkersRef.current.forEach(marker => marker.setMap(null));
    locationMarkersRef.current = [];
  };

  const focusLocationInput = (target) => {
    const input = target === 'pickup' ? pickupInputRef.current : returnInputRef.current;
    if (!input) return;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => input.focus());
      return;
    }
    input.focus();
  };

  const activateLocationTarget = (target) => {
    setActiveTarget(target);
    focusLocationInput(target);
  };

  const applyPoint = (target, point, label = point?.name ?? '', focusInput = true) => {
    if (!point) return;
    const next = { name: label || point.name || '', lat: Number(point.lat), lng: Number(point.lng) };
    if (target === 'pickup') {
      setPickupPoint(next);
      setPickupText(next.name);
    } else {
      setReturnPoint(next);
      setReturnText(next.name);
    }
    setSelected(null);
    clearArc();
    if (locationMapRef.current && Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
      locationMapRef.current.panTo?.({ lat: next.lat, lng: next.lng });
      const currentZoom = typeof locationMapRef.current.getZoom === 'function' ? Number(locationMapRef.current.getZoom()) : 0;
      locationMapRef.current.setZoom?.(Math.max(Number.isFinite(currentZoom) ? currentZoom : 0, 12));
    }
    if (focusInput) focusLocationInput(target);
  };

  const lookupPoint = async (raw) => {
    const q = raw.trim();
    if (!q) return null;
    const preset = resolveAreaPreset(q);
    if (preset?.preset) return pointFromPreset(preset.preset, locale);
    const hit = await geocodeAddress(q);
    return hit ? { name: hit.formatted || q, lat: hit.lat, lng: hit.lng } : null;
  };

  const runRouteSearch = async () => {
    if (!dateSelectionComplete) {
      setRouteError(t('dateTimeRequired'));
      setFlowStep('dates');
      return;
    }
    const needsLookup = (text, point) => {
      const q = text.trim();
      return q && (!point || point.name !== q);
    };
    setRouteSearching(true);
    setRouteError('');
    try {
      const [pickup, ret] = await Promise.all([
        needsLookup(pickupText, pickupPoint) ? lookupPoint(pickupText) : Promise.resolve(pickupPoint),
        needsLookup(returnText, returnPoint) ? lookupPoint(returnText) : Promise.resolve(returnPoint),
      ]);
      const pickupFailed = pickupText.trim() && !pickup;
      const returnFailed = returnText.trim() && !ret;
      if (pickupFailed || returnFailed) setRouteError(t('ow_geocodeFail'));
      if (pickup) applyPoint('pickup', pickup, pickup.name, false);
      if (ret) applyPoint('return', ret, ret.name, false);
      if (pickup || ret || pickupDate || returnDate || selectedClass !== 'all') {
        setShowResults(true);
        setSelected(null);
        clearArc();
      }
    } finally {
      setRouteSearching(false);
    }
  };

  const clearRouteSearch = () => {
    setPickupText('');
    setReturnText('');
    setPickupPoint(null);
    setReturnPoint(null);
    setPickupDate('');
    setReturnDate('');
    setSelectedClass('all');
    setFlowStep('location');
    setShowResults(false);
    setRouteError('');
    setSelected(null);
    clearArc();
  };

  const reserveWithSearch = (listing) => onReserve?.(listing, {
    pickupDate,
    returnDate,
    pickupPoint,
    returnPoint,
    selectedClass,
  });

  const drawArc = (google, listing) => {
    clearArc();
    if (!listing.from?.lat || !listing.to?.lat) return;
    const pts = arcPoints(listing.from, listing.to);

    // 下地グロー（控えめなライトパープル）
    glowRef.current = new google.maps.Polyline({
      path: [], geodesic: false, strokeColor: '#a855f7', strokeOpacity: 0.28, strokeWeight: 9, map: mapRef.current,
    });
    // 本線（クリーンなパープル）＋ 先端の矢印
    arcRef.current = new google.maps.Polyline({
      path: [], geodesic: false, strokeColor: '#7c3aed', strokeOpacity: 1, strokeWeight: 3.5,
      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.5, strokeColor: '#6d28d9', fillColor: '#7c3aed', fillOpacity: 1 }, offset: '100%' }],
      map: mapRef.current,
    });

    let i = 0;
    arcTimer.current = setInterval(() => {
      i += 2;
      const slice = pts.slice(0, Math.min(i, pts.length));
      glowRef.current?.setPath(slice);
      arcRef.current?.setPath(slice);
      if (i >= pts.length) {
        clearInterval(arcTimer.current); arcTimer.current = null;
        // 描画後：車アイコンがルート上を走る（進行方向へ回転）
        const carIcon = (rotation) => ({
          path: CAR_ICON_PATH,
          fillColor: '#7c3aed', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 1.4,
          scale: 1.5, rotation,
          anchor: new google.maps.Point(0, 0),
        });
        carRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: pts[0],
          zIndex: 999,
          icon: carIcon(headingDeg(pts[0], pts[1] ?? pts[0])),
        });
        let j = 0;
        travelTimer.current = setInterval(() => {
          j = (j + 1) % pts.length;
          const cur = pts[j];
          const nxt = pts[(j + 1) % pts.length];
          carRef.current?.setPosition(cur);
          carRef.current?.setIcon(carIcon(headingDeg(cur, nxt)));
        }, 55);
      }
    }, 14);

    const b = new google.maps.LatLngBounds();
    b.extend(listing.from); b.extend(listing.to);
    mapRef.current.fitBounds(b, 90);
  };

  const drawRouteLines = (google) => {
    clearRouteLines();
    if (!mapRef.current) return;
    visibleListings.forEach((listing, index) => {
      const fromPoint = pickupMarkerPoints[String(listing.id)] ?? listing.from;
      const toPoint = returnMarkerPoints[String(listing.id)] ?? listing.to;
      if (fromPoint?.lat == null || fromPoint?.lng == null || toPoint?.lat == null || toPoint?.lng == null) return;
      const active = selected && String(selected.id) === String(listing.id);
      const line = new google.maps.Polyline({
        path: arcPoints(fromPoint, toPoint, 48),
        geodesic: false,
        strokeColor: active ? '#7c3aed' : '#a78bfa',
        strokeOpacity: active ? 0.95 : 0.42,
        strokeWeight: active ? 3.8 : 2.4,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: active ? 3.6 : 2.6,
            strokeColor: active ? '#5b21b6' : '#8b5cf6',
            fillColor: active ? '#7c3aed' : '#a78bfa',
            fillOpacity: 1,
          },
          offset: '100%',
        }],
        map: mapRef.current,
        zIndex: active ? 30 : 10 + index,
      });
      line.addListener('click', () => select(listing, google));
      routeLinesRef.current.push(line);
    });
  };

  const select = (listing, google) => {
    setSelected(listing);
    if (google && mapRef.current) drawArc(google, listing);
  };

  useEffect(() => {
    if (!selected) return;
    if (!visibleListings.some(listing => String(listing.id) === String(selected.id))) {
      setSelected(null);
      clearArc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleListings, selected]);

  useEffect(() => {
    if (showResults) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (pulseTimer.current) { clearInterval(pulseTimer.current); pulseTimer.current = null; }
    setMapReady(false);
    mapRef.current = null;
    clearRouteLines();
    clearArc();
  }, [showResults]);

  useEffect(() => {
    if (showResults) {
      locationClickListenerRef.current?.remove?.();
      locationClickListenerRef.current = null;
      clearLocationMarkers();
      locationMapRef.current = null;
      setLocationMapReady(false);
    }
  }, [showResults]);

  // 場所入力ステップでも地図を表示し、タップした地点を選択中の入力欄へ入れる。
  useEffect(() => {
    if (showResults || flowStep !== 'location' || mapFailed || !locationMapDiv.current) return;
    if (locationMapRef.current) return;
    let alive = true;
    loadGoogleMaps()
      .then(google => {
        if (!alive) return;
        const center = pickupPoint || returnPoint || { lat: 34.6937, lng: 135.5023 };
        locationMapRef.current = new google.maps.Map(locationMapDiv.current, {
          center,
          zoom: pickupPoint || returnPoint ? 11 : 7,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
          backgroundColor: '#eef2f7',
        });
        locationClickListenerRef.current = locationMapRef.current.addListener('click', async (e) => {
          const target = activeTargetRef.current;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          const fallback = target === 'pickup' ? t('ow_mapSelectedPickup') : t('ow_mapSelectedReturn');
          applyPoint(target, { name: fallback, lat, lng }, fallback);
          const formatted = await reverseGeocode(lat, lng).catch(() => null);
          if (formatted) applyPoint(target, { name: formatted, lat, lng }, formatted);
        });
        setLocationMapReady(true);
      })
      .catch(() => { if (alive) setMapFailed(true); });
    return () => {
      alive = false;
      locationClickListenerRef.current?.remove?.();
      locationClickListenerRef.current = null;
      clearLocationMarkers();
      locationMapRef.current = null;
      setLocationMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowStep, mapFailed, showResults]);

  useEffect(() => {
    if (showResults || flowStep !== 'location' || !locationMapReady || !locationMapRef.current || !window.google) return;
    const google = window.google;
    clearLocationMarkers();
    const bounds = new google.maps.LatLngBounds();
    [
      [pickupPoint, '#2563eb', 'P', t('ow_pickupArea')],
      [returnPoint, '#7c3aed', 'R', t('ow_returnArea')],
    ].forEach(([point, color, text, title]) => {
      if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return;
      const position = { lat: Number(point.lat), lng: Number(point.lng) };
      const marker = new google.maps.Marker({
        position,
        map: locationMapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: { text, color: '#ffffff', fontSize: '12px', fontWeight: '900' },
        title,
        zIndex: 1000,
      });
      locationMarkersRef.current.push(marker);
      bounds.extend(position);
    });
    if (!bounds.isEmpty()) locationMapRef.current.fitBounds(bounds, 70);
  }, [showResults, flowStep, locationMapReady, pickupPoint, returnPoint, t]);

  // 地図初期化
  useEffect(() => {
    if (!showResults || mapFailed || !mapDiv.current) return;
    if (mapRef.current) return;
    let alive = true;
    loadGoogleMaps()
      .then(google => {
        if (!alive) return;
        mapRef.current = new google.maps.Map(mapDiv.current, {
          center: { lat: 36.2, lng: 137.9 }, zoom: 5,
          disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
          backgroundColor: '#f6f4ff', styles: CYBER_MAP_STYLE,
        });
        mapRef.current.addListener('click', (e) => {
          const target = activeTargetRef.current;
          const label = target === 'pickup' ? t('ow_mapSelectedPickup') : t('ow_mapSelectedReturn');
          applyPoint(target, { name: label, lat: e.latLng.lat(), lng: e.latLng.lng() }, label);
        });
        setMapReady(true);
      })
      .catch(() => { if (alive) setMapFailed(true); });
    return () => { alive = false; clearRouteLines(); clearArc(); if (pulseTimer.current) clearInterval(pulseTimer.current); };
  }, [mapFailed, showResults]);

  // ピン配置＋パルスアニメーション
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google) return;
    const google = window.google;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (pulseTimer.current) { clearInterval(pulseTimer.current); pulseTimer.current = null; }

    const bounds = new google.maps.LatLngBounds();
    visibleListings.forEach((listing, index) => {
      const fromPoint = pickupMarkerPoints[String(listing.id)] ?? listing.from;
      const toPoint = returnMarkerPoints[String(listing.id)] ?? listing.to;
      if (fromPoint?.lat == null || fromPoint?.lng == null) return;
      const status = pinStatus(listing);
      const color = PIN_COLORS[status];
      const marker = new google.maps.Marker({
        position: { lat: fromPoint.lat, lng: fromPoint.lng },
        map: mapRef.current,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.2 },
        label: { text: String(index + 1), color: '#ffffff', fontSize: '10px', fontWeight: '900' },
        title: `${listing.maker} ${listing.model}`,
      });
      marker.__baseScale = 8;
      marker.__color = color;
      marker.addListener('click', () => select(listing, google));
      markersRef.current.push(marker);
      bounds.extend(fromPoint);
      if (hasRouteFilter && toPoint?.lat != null && toPoint?.lng != null) {
        const toMarker = new google.maps.Marker({
          position: { lat: toPoint.lat, lng: toPoint.lng },
          map: mapRef.current,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#14b8a6', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
          label: { text: String(index + 1), color: '#ffffff', fontSize: '9px', fontWeight: '900' },
          title: listing.to?.name ?? '',
        });
        toMarker.addListener('click', () => select(listing, google));
        markersRef.current.push(toMarker);
        bounds.extend(toPoint);
      }
    });
    [
      [pickupPoint, '#2563eb', t('ow_pickupArea')],
      [returnPoint, '#7c3aed', t('ow_returnArea')],
    ].forEach(([point, color, title]) => {
      if (!point?.lat || !point?.lng) return;
      const marker = new google.maps.Marker({
        position: { lat: point.lat, lng: point.lng },
        map: mapRef.current,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: color, fillOpacity: 0.22, strokeColor: color, strokeWeight: 3 },
        title,
        zIndex: 1000,
      });
      markersRef.current.push(marker);
      bounds.extend(point);
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 60);

    // ネオンの脈動（scale と strokeWeight を正弦波で揺らす）
    pulseTimer.current = setInterval(() => {
      const now = performance.now();
      markersRef.current.forEach((m, idx) => {
        if (!m.__color) return;
        const s = 7.5 + (Math.sin(now / 520 + idx) + 1) * 0.85;
        m.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: s, fillColor: m.__color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.2 });
      });
    }, 55);
  }, [mapReady, visibleListings, pickupMarkerPoints, returnMarkerPoints, hasRouteFilter, pickupPoint, returnPoint, t]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google) return undefined;
    drawRouteLines(window.google);
    return clearRouteLines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, visibleListings, pickupMarkerPoints, returnMarkerPoints, selected]);

  const minDate = todayValue();
  const classSummary = selectedClass === 'all' ? t('ow_anyClass') : displayClassLabel(selectedClass, locale);
  const dateSummary = pickupDate || returnDate
    ? `${pickupDate || t('ow_anyDate')}${returnDate ? ` → ${returnDate}` : ''}`
    : t('ow_anyDate');
  const calendarDays = buildCalendarMonth(calendarMonth, minDate);
  const calendarWeekdays = weekdayLabels(locale);
  const calendarMonthLabel = formatCalendarMonth(calendarMonth, locale);
  const selectCalendarDate = (value) => {
    if (!value || value < minDate) return;
    if (!pickupDate || (pickupDate && returnDate) || value <= pickupDate) {
      setPickupDate(value);
      setReturnDate('');
      setRouteError('');
      setCalendarMonth(monthValueFromDate(value));
      return;
    }
    setReturnDate(value);
    setRouteError('');
    setCalendarMonth(monthValueFromDate(value));
  };
  const locationSummary = [
    pickupText || t('ow_pickupArea'),
    returnText || t('ow_returnArea'),
  ].join(' → ');
  const hasRunnableSearch = Boolean(dateSelectionComplete && (
    pickupText.trim() || returnText.trim() || pickupPoint || returnPoint || selectedClass !== 'all'
  ));
  const stepPill = (id, n, label) => (
    <button
      type="button"
      onClick={() => setFlowStep(id)}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2 text-left transition ${
        flowStep === id ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
        flowStep === id ? 'bg-white text-gray-900' : 'bg-white text-gray-500'
      }`}>{n}</span>
      <span className="truncate text-xs font-black">{label}</span>
    </button>
  );

  const searchPanel = showResults ? (
    <div className="mb-3 rounded-2xl border border-purple-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900">{t('ow_searchSummaryTitle')}</p>
          <p className="truncate text-[11px] text-gray-500">{locationSummary} · {dateSummary} · {classSummary}</p>
        </div>
        <button type="button" onClick={() => { setShowResults(false); setFlowStep('location'); }}
          className="flex-shrink-0 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-black text-purple-700">
          {t('ow_changeSearch')}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-purple-50 px-3 py-2">
        <p className="min-w-0 truncate text-xs font-semibold text-purple-800">
          {fill(t('ow_routeMatched'), { n: visibleListings.length })}
          {routeResult.radiusKm ? ` · ${fill(t('ow_routeRadius'), { r: routeResult.radiusKm })}` : ''}
        </p>
        <button type="button" onClick={clearRouteSearch} className="text-xs font-bold text-purple-600">
          {t('ow_routeClear')}
        </button>
      </div>
    </div>
  ) : (
    <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-lg">
      <div className="mb-4 flex gap-2">
        {stepPill('location', 1, t('ow_searchStepLocation'))}
        {stepPill('dates', 2, t('ow_searchStepDates'))}
        {stepPill('class', 3, t('ow_searchStepClass'))}
      </div>

      {flowStep === 'location' && (
        <div>
          <div className="mb-3">
            <p className="text-xl font-black text-gray-900">{t('ow_routeSearchTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('ow_routeSearchHint')}</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <section data-location-field="pickup" className={`rounded-2xl border p-3 ${activeTarget === 'pickup' ? 'border-purple-400 bg-purple-50/70' : 'border-gray-200 bg-gray-50'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500">{t('ow_pickupArea')}</span>
                <button type="button" onClick={() => activateLocationTarget('pickup')}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-black active:scale-95 ${activeTarget === 'pickup' ? 'bg-purple-700 text-white' : 'bg-white text-purple-700 ring-1 ring-purple-200'}`}>
                  {t('ow_mapPickMode')}
                </button>
              </div>
              <input ref={pickupInputRef} value={pickupText}
                onFocus={() => setActiveTarget('pickup')}
                onChange={e => { setPickupText(e.target.value); setPickupPoint(null); setActiveTarget('pickup'); }}
                placeholder={t('ow_pickupPlaceholder')}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 outline-none focus:border-purple-400 focus:bg-white" />
              <div className="mt-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-bold text-gray-500">{t('ow_popularAreas')}</span>
                  <span className="text-[10px] font-semibold text-purple-600">{t('ow_pickupMapMode')}</span>
                </div>
                <div className="flex flex-wrap gap-2 pb-1">
                  {featuredPresets.map(preset => (
                    <button key={preset.id} type="button" onClick={() => applyPoint('pickup', pointFromPreset(preset, locale))}
                      className="max-w-full rounded-full border border-purple-200 bg-white px-3 py-2 text-center text-xs font-bold leading-tight text-purple-700 whitespace-normal break-keep active:scale-95">
                      {areaPresetLabel(preset, locale)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section data-location-field="return" className={`rounded-2xl border p-3 ${activeTarget === 'return' ? 'border-purple-400 bg-purple-50/70' : 'border-gray-200 bg-gray-50'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500">{t('ow_returnArea')}</span>
                <button type="button" onClick={() => activateLocationTarget('return')}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-black active:scale-95 ${activeTarget === 'return' ? 'bg-purple-700 text-white' : 'bg-white text-purple-700 ring-1 ring-purple-200'}`}>
                  {t('ow_mapPickMode')}
                </button>
              </div>
              <input ref={returnInputRef} value={returnText}
                onFocus={() => setActiveTarget('return')}
                onChange={e => { setReturnText(e.target.value); setReturnPoint(null); setActiveTarget('return'); }}
                placeholder={t('ow_returnPlaceholder')}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] text-gray-900 outline-none focus:border-purple-400 focus:bg-white" />
              <div className="mt-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-bold text-gray-500">{t('ow_popularAreas')}</span>
                  <span className="text-[10px] font-semibold text-purple-600">{t('ow_returnMapMode')}</span>
                </div>
                <div className="flex flex-wrap gap-2 pb-1">
                  {featuredPresets.map(preset => (
                    <button key={preset.id} type="button" onClick={() => applyPoint('return', pointFromPreset(preset, locale))}
                      className="max-w-full rounded-full border border-purple-200 bg-white px-3 py-2 text-center text-xs font-bold leading-tight text-purple-700 whitespace-normal break-keep active:scale-95">
                      {areaPresetLabel(preset, locale)}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2">
              <span className="min-w-0 truncate text-xs font-black text-gray-800">{t('ow_mapPickMode')}</span>
              <span className="flex-shrink-0 rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-black text-white">
                {activeTarget === 'pickup' ? t('ow_pickupMapMode') : t('ow_returnMapMode')}
              </span>
            </div>
            {mapFailed ? (
              <div className="flex h-56 items-center justify-center px-4 text-center text-xs font-semibold text-gray-500">
                {t('ow_mapUnavailable')}
              </div>
            ) : (
              <div data-oneway-location-map ref={locationMapDiv} className="h-56 w-full sm:h-64" />
            )}
          </div>
          <button type="button" onClick={() => setFlowStep('dates')}
            className="mt-4 w-full rounded-2xl bg-gray-900 py-3.5 text-sm font-black text-white">
            {t('ow_nextDates')}
          </button>
        </div>
      )}

      {flowStep === 'dates' && (
        <div>
          <div className="mb-3">
            <p className="text-xl font-black text-gray-900">{t('ow_searchStepDates')}</p>
            <p className="mt-1 text-xs text-gray-500">{locationSummary}</p>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className={`rounded-2xl border px-3 py-2.5 ${pickupDate ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
              <span className="block text-[10px] font-black uppercase">{t('ow_pickupDate')}</span>
              <span className="mt-1 block truncate text-sm font-black">{pickupDate || t('ow_anyDate')}</span>
            </div>
            <div className={`rounded-2xl border px-3 py-2.5 ${returnDate ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
              <span className="block text-[10px] font-black uppercase">{t('ow_returnDate')}</span>
              <span className="mt-1 block truncate text-sm font-black">{returnDate || t('ow_anyDate')}</span>
            </div>
          </div>
          <div data-oneway-date-calendar className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <button type="button"
                onClick={() => setCalendarMonth(addMonthsToMonth(calendarMonth, -1))}
                disabled={addMonthsToMonth(calendarMonth, -1) < monthValueFromDate(minDate)}
                aria-label="previous month"
                className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black text-gray-700 active:scale-95 disabled:text-gray-300">
                ‹
              </button>
              <p className="text-lg font-black text-gray-900">{calendarMonthLabel}</p>
              <button type="button"
                onClick={() => setCalendarMonth(addMonthsToMonth(calendarMonth, 1))}
                aria-label="next month"
                className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black text-gray-700 active:scale-95">
                ›
              </button>
            </div>
            <div className="mb-2 grid grid-cols-7 text-center text-xs font-black text-gray-400">
              {calendarWeekdays.map((label, index) => (
                <span key={`${label}-${index}`} className={index === 0 ? 'text-rose-500' : index === 6 ? 'text-blue-500' : ''}>{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-2 text-center">
              {calendarDays.map(day => {
                if (day.blank) return <span key={day.key} className="h-11" />;
                const isPickup = day.value === pickupDate;
                const isReturn = day.value === returnDate;
                const inRange = pickupDate && returnDate && day.value > pickupDate && day.value < returnDate;
                return (
                  <button key={day.key} type="button" onClick={() => selectCalendarDate(day.value)}
                    disabled={day.disabled}
                    className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full text-sm font-black transition active:scale-95 disabled:text-gray-300 ${
                      isPickup || isReturn
                        ? 'bg-gray-900 text-white shadow-md'
                        : inRange
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                    {day.day}
                  </button>
                );
              })}
            </div>
          </div>
          {routeError && <p className="mt-3 text-xs font-semibold text-red-500">{routeError}</p>}
          <button type="button" onClick={() => setFlowStep('class')} disabled={!dateSelectionComplete}
            className="mt-4 w-full rounded-2xl bg-gray-900 py-3.5 text-sm font-black text-white disabled:opacity-45">
            {t('ow_nextClass')}
          </button>
        </div>
      )}

      {flowStep === 'class' && (
        <div>
          <div className="mb-3">
            <p className="text-xl font-black text-gray-900">{t('ow_searchStepClass')}</p>
            <p className="mt-1 text-xs text-gray-500">{dateSummary}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {VEHICLE_CLASSES.map(c => {
              const active = selectedClass === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-oneway-class-card
                  onClick={() => setSelectedClass(c.id)}
                  className={`overflow-hidden rounded-2xl border-2 bg-white text-left transition-all active:scale-[0.98] ${
                    active ? 'border-purple-600 ring-2 ring-purple-300 shadow-md' : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
                  }`}
                >
                  {c.img
                    ? <img src={c.img} alt="" loading="lazy"
                        className="h-28 w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <div className="flex h-28 w-full items-center justify-center bg-purple-50 text-4xl">{c.icon}</div>}
                  <div className={`px-3 py-3 ${active ? 'bg-purple-50' : 'bg-white'}`}>
                    <span className="block truncate text-[15px] font-black text-gray-900">{locale === 'ja' ? c.ja : c.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {routeError && <p className="mt-3 text-xs font-semibold text-red-500">{routeError}</p>}
          <button type="button" onClick={runRouteSearch} disabled={routeSearching || !hasRunnableSearch}
            className="mt-4 w-full rounded-2xl bg-purple-700 py-3.5 text-sm font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)] disabled:opacity-45">
            {routeSearching ? t('ow_geocoding') : t('ow_showRoutes')}
          </button>
        </div>
      )}
    </div>
  );

  if (!showResults) {
    return <div>{searchPanel}</div>;
  }

  // ── フォールバック（APIキー無し）：リスト表示 ──
  if (mapFailed) {
    return (
      <div>
        {searchPanel}
        <p className="mb-3 rounded-xl bg-amber-900/20 p-3 text-xs text-amber-300">⚠️ {t('ow_mapUnavailable')}</p>
        {visibleListings.length === 0
          ? <p className="py-8 text-center text-sm text-gray-400">{hasSearchFilter ? t('ow_routeNoMatch') : t('ow_noListings')}</p>
          : (
            <div className="space-y-3">
              {visibleListings.map(listing => {
                const status = pinStatus(listing);
                const search = { pickupDate, returnDate };
                const rentalDays = routeRentalDays(search);
                const rentalBaseAmount = routeRentalBaseAmount(listing, search);
                return (
                  <button key={listing.id} onClick={() => reserveWithSearch(listing)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-purple-200 bg-white p-3 text-left shadow-sm active:scale-[0.99] hover:border-purple-400">
                    {listing.img
                      ? <img src={listing.img} alt="" className="h-14 w-20 flex-shrink-0 rounded-lg object-cover" />
                      : <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-purple-100 text-2xl">🚗</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: PIN_COLORS[status] }}>
                          {status === 'now' ? t('ow_availableNow') : t('ow_upcoming')}
                        </span>
                        <span className="truncate text-sm font-bold text-gray-900">{listing.maker} {listing.model}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-600">{listing.from?.name} → {listing.to?.name} · {listing.distanceKm}km</p>
                      <p className="text-xs text-gray-500">
                        {t('ow_baseFee')}: <span className="font-bold text-gray-900">{rentalBaseAmount > 0 ? yen(rentalBaseAmount) : t('ow_free')}</span>
                        {rentalDays > 1 ? <> · {rentalDays}d</> : null}
                      </p>
                      {listing.baseFee > 0 && (
                        <p className="text-xs text-gray-500">{t('cr_baseFee')}: <span className="font-bold text-purple-700">{yen(listing.baseFee)}</span></p>
                      )}
                      {(listing.routeSearch?.pickupDistanceKm != null || listing.routeSearch?.returnDistanceKm != null) && (
                        <p className="mt-0.5 text-[11px] font-semibold text-purple-700">
                          {listing.routeSearch?.pickupDistanceKm != null && fill(t('ow_pickupDistance'), { d: fmtKm(listing.routeSearch.pickupDistanceKm) })}
                          {listing.routeSearch?.pickupDistanceKm != null && listing.routeSearch?.returnDistanceKm != null ? ' · ' : ''}
                          {listing.routeSearch?.returnDistanceKm != null && fill(t('ow_returnDistance'), { d: fmtKm(listing.routeSearch.returnDistanceKm) })}
                        </p>
                      )}
                    </div>
                    <span className="text-purple-500">›</span>
                  </button>
                );
              })}
            </div>
          )}
      </div>
    );
  }

  // ── マップ表示（サイバー） ──
  return (
    <>
      {searchPanel}
      <div className="relative h-[50dvh] min-h-[360px] max-h-[520px] w-full overflow-hidden rounded-2xl border border-purple-300/60 shadow-[0_8px_30px_rgba(124,58,237,0.15)] md:h-[58vh] md:min-h-[520px]">
        <style>{CYBER_CSS}</style>
        <div ref={mapDiv} className="h-full w-full" />
        {/* うっすら紫の緯線経線のみ */}
        <div className="ow-grid" />
        {!selected && visibleListings.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full border border-purple-300/70 bg-white/90 px-3 py-1.5 text-xs font-medium text-purple-800 shadow-sm backdrop-blur-sm">👆 {t('ow_tapPin')}</span>
          </div>
        )}
        {visibleListings.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl border border-purple-200 bg-white/95 p-4 text-center text-sm font-semibold text-gray-600 shadow-lg">
            {hasSearchFilter ? t('ow_routeNoMatch') : t('ow_noListings')}
          </div>
        )}
        {hasRouteFilter && visibleListings.length > 0 && routeResult.radiusKm && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-purple-200 bg-white/95 px-3 py-1.5 text-[11px] font-black text-purple-700 shadow-sm">
            {fill(t('ow_routeRadius'), { r: routeResult.radiusKm })}
          </div>
        )}
      </div>
      <RouteResultsPanel
        listings={visibleListings}
        selected={selected}
        t={t}
        search={{ pickupDate, returnDate }}
        onSelect={(listing) => {
          if (typeof window !== 'undefined' && window.google) select(listing, window.google);
          else setSelected(listing);
        }}
        onReserve={reserveWithSearch}
        onClear={() => { setSelected(null); clearArc(); }}
      />
    </>
  );
}
