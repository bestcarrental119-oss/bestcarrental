'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { useCurrency } from '../lib/currency';
import { VEHICLE_CLASSES, JAPAN_AIRPORTS } from '../lib/data';
import { BOOKING_TYPES, buildClassVirtualListings, classLabel, normalizeVehicleClass } from '../lib/runOfFleet';
import { loadGoogleMaps, geocodeAddress, priceMarkerIcon } from '../lib/googleMaps';
import { buildStoreMapGroups } from '../lib/searchMapStores';

// ── Fallback coords for demo vehicles without lat/lng set ─────────────────────
const FALLBACK_COORDS = {
  1: [35.6595, 139.7005], // Shibuya
  2: [35.6896, 139.6995], // Shinjuku
  3: [35.6627, 139.7307], // Roppongi
  4: [35.5494, 139.7798], // Haneda
  5: [35.6595, 139.7005], // Shibuya
  6: [35.6437, 139.6985], // Nakameguro
};

// ── Area / city geocode table ────────────────────────────────────────────────
// Maps free-text `loc` values to real coordinates so cars land on their actual
// area instead of all piling onto one airport point. Keys are matched as
// case-insensitive substrings against the vehicle's `loc`.
const AREA_COORDS = {
  'shibuya': [35.6595, 139.7005], '渋谷': [35.6595, 139.7005],
  'shinjuku': [35.6896, 139.6995], '新宿': [35.6896, 139.6995],
  'roppongi': [35.6627, 139.7307], '六本木': [35.6627, 139.7307],
  'nakameguro': [35.6437, 139.6985], '中目黒': [35.6437, 139.6985],
  'meguro': [35.6339, 139.7157], '目黒': [35.6339, 139.7157],
  'ginza': [35.6717, 139.7650], '銀座': [35.6717, 139.7650],
  'ikebukuro': [35.7295, 139.7109], '池袋': [35.7295, 139.7109],
  'shinagawa': [35.6285, 139.7387], '品川': [35.6285, 139.7387],
  'ueno': [35.7138, 139.7770], '上野': [35.7138, 139.7770],
  'asakusa': [35.7148, 139.7967], '浅草': [35.7148, 139.7967],
  'akihabara': [35.6984, 139.7731], '秋葉原': [35.6984, 139.7731],
  'odaiba': [35.6297, 139.7797], 'お台場': [35.6297, 139.7797],
  'haneda': [35.5494, 139.7798], '羽田': [35.5494, 139.7798],
  'narita': [35.7720, 140.3929], '成田': [35.7720, 140.3929],
  'chiba': [35.6074, 140.1065], '千葉': [35.6074, 140.1065],
  'yokohama': [35.4437, 139.6380], '横浜': [35.4437, 139.6380],
  'kawasaki': [35.5308, 139.7029], '川崎': [35.5308, 139.7029],
  'saitama': [35.8617, 139.6455], '埼玉': [35.8617, 139.6455],
  'tokyo': [35.6812, 139.7671], '東京': [35.6812, 139.7671],
  'osaka': [34.6937, 135.5023], '大阪': [34.6937, 135.5023],
  'namba': [34.6659, 135.5010], '難波': [34.6659, 135.5010],
  'umeda': [34.7025, 135.4959], '梅田': [34.7025, 135.4959],
  'kyoto': [35.0116, 135.7681], '京都': [35.0116, 135.7681],
  'kobe': [34.6901, 135.1955], '神戸': [34.6901, 135.1955],
  'nagoya': [35.1815, 136.9066], '名古屋': [35.1815, 136.9066],
  'fukuoka': [33.5902, 130.4017], '福岡': [33.5902, 130.4017],
  'hakata': [33.5898, 130.4207], '博多': [33.5898, 130.4207],
  'sapporo': [43.0618, 141.3545], '札幌': [43.0618, 141.3545],
  'chitose': [42.7750, 141.6922], '千歳': [42.7750, 141.6922],
  'naha': [26.2124, 127.6809], '那覇': [26.2124, 127.6809],
  'okinawa': [26.3344, 127.8056], '沖縄': [26.3344, 127.8056],
  'sendai': [38.2682, 140.8694], '仙台': [38.2682, 140.8694],
  'hiroshima': [34.3853, 132.4553], '広島': [34.3853, 132.4553],
  'kumamoto': [32.8032, 130.7079], '熊本': [32.8032, 130.7079],
  // Kansai-area cities (near KIX) — more specific than "大阪"
  'izumisano': [34.4058, 135.3273], '泉佐野': [34.4058, 135.3273],
  '関西空港': [34.4320, 135.2304], '関空': [34.4320, 135.2304], 'kansai airport': [34.4320, 135.2304],
  '岸和田': [34.4600, 135.3710], '堺': [34.5733, 135.4830], 'sakai': [34.5733, 135.4830],
  '東大阪': [34.6794, 135.6008], '豊中': [34.7816, 135.4697], '吹田': [34.7614, 135.5158],
  '高槻': [34.8463, 135.6172], '枚方': [34.8144, 135.6510], '八尾': [34.6269, 135.6008],
  '和泉': [34.4836, 135.4210], '貝塚': [34.4340, 135.3560], '泉大津': [34.5040, 135.4110],
  // Tokyo wards / common areas (more specific than "東京")
  '世田谷': [35.6465, 139.6530], '練馬': [35.7357, 139.6517], '江戸川': [35.7069, 139.8686],
  '足立': [35.7750, 139.8044], '杉並': [35.6994, 139.6363], '板橋': [35.7512, 139.7093],
  '大田': [35.5613, 139.7160], '江東': [35.6730, 139.8170], '葛飾': [35.7434, 139.8474],
  '町田': [35.5460, 139.4386], '八王子': [35.6664, 139.3160], '立川': [35.7140, 139.4074],
  // Other major cities
  '博多': [33.5898, 130.4207], '天神': [33.5914, 130.3990], '小倉': [33.8865, 130.8820],
  '横浜': [35.4437, 139.6380], '千葉市': [35.6074, 140.1065], '船橋': [35.6947, 139.9826],
  'さいたま': [35.8617, 139.6455], '大宮': [35.9066, 139.6238], '川口': [35.8078, 139.7240],
  '金沢': [36.5613, 136.6562], '静岡': [34.9756, 138.3828], '浜松': [34.7108, 137.7261],
  '岡山': [34.6551, 133.9195], '高松': [34.3428, 134.0466], '鹿児島': [31.5966, 130.5571],
  '長崎': [32.7503, 129.8777], '宮崎': [31.9111, 131.4239], '大分': [33.2382, 131.6126],
  '奈良': [34.6851, 135.8048], '和歌山': [34.2261, 135.1675], '姫路': [34.8154, 134.6857],
};

const norm = (s) => String(s ?? '').toLowerCase();
const normAddr = (s) => String(s ?? '').trim().toLowerCase();

// Radius (km) used to keep only the cars near the searched place.
const SEARCH_RADIUS_KM = 40;
// Great-circle distance between two [lat,lng] points, in km.
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};
const chatOwnerIdOf = (vehicle) => vehicle?.ownerId ?? vehicle?.owner_id ?? vehicle?.ownerAuthId ?? vehicle?.owner_auth_id ?? null;
const canPreBookingChat = (vehicle) => (
  vehicle?.listingType !== BOOKING_TYPES.CLASS_BASED &&
  Boolean(vehicle?.preBookingChatEnabled ?? vehicle?.pre_booking_chat_enabled) &&
  Boolean(chatOwnerIdOf(vehicle))
);

// Deterministic pseudo-random in [0,1) seeded by an id (+ optional salt).
const seeded = (id, salt = 0) => {
  const str = String(id) + ':' + salt;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};

// Resolve coords from the vehicle's location text / airport tag / the searched airport.
const airportCoords = (v, airportCode) => {
  const list = JAPAN_AIRPORTS || [];
  // 1) vehicle's own airport tags
  if (Array.isArray(v.airports) && v.airports.length) {
    const ap = list.find(a => a.code === v.airports[0]);
    if (ap) return [ap.lat, ap.lng];
  }
  // 2) match the location text against an airport name / city / area
  const loc = norm(v.loc);
  if (loc) {
    const ap = list.find(a =>
      loc.includes(norm(a.name)) || loc.includes(norm(a.nameEn)) ||
      loc.includes(norm(a.city)) || loc.includes(norm(a.loc)) ||
      norm(a.name).includes(loc) || norm(a.loc).includes(loc) || norm(a.city).includes(loc));
    if (ap) return [ap.lat, ap.lng];
  }
  // 3) the airport the user searched by
  if (airportCode) {
    const ap = list.find(a => a.code === airportCode);
    if (ap) return [ap.lat, ap.lng];
  }
  return null;
};

// Match the vehicle's free-text location against the area geocode table.
const areaCoords = (v) => {
  const loc = norm(v.loc);
  if (!loc) return null;
  // Pick the most specific (longest) place name that appears in the address, so
  // "大阪府泉佐野市…" resolves to 泉佐野 (near KIX), not the generic 大阪 center.
  let best = null, bestLen = 0;
  for (const [key, coord] of Object.entries(AREA_COORDS)) {
    const k = norm(key);
    if (k.length > bestLen && loc.includes(k)) { best = coord; bestLen = k.length; }
  }
  return best;
};

// Resolve a *base* coordinate for a listing. Priority:
//   explicit lat/lng → area text → demo fallback → airport → searched airport → Tokyo.
// Always returns a coordinate (never null) so every listing gets a pin.
const resolveBaseCoords = (v, airportCode, geo = {}) => {
  if (v.lat && v.lng) return { coord: [+v.lat, +v.lng], exact: true };
  // Accurate coordinate geocoded from the vehicle's real address (see the
  // Nominatim effect below). Treated as non-exact so multiple cars at the same
  // dealer address get spread into a small readable cluster around the point.
  const g = geo[normAddr(v.loc)];
  if (g && Array.isArray(g)) return { coord: g, exact: false };
  const base = areaCoords(v) ?? FALLBACK_COORDS[v.id] ?? airportCoords(v, airportCode);
  if (base) return { coord: base, exact: false };
  return { coord: [35.6812, 139.7671], exact: false }; // Tokyo Station default
};

// Build a stable id → coordinate map for the current result set, spreading any
// listings that resolve to the same point onto a small deterministic ring so
// pins never sit exactly on top of each other (which made pin↔card selection
// pick the wrong car). Listings with an exact lat/lng are never moved.
const buildCoordsById = (listings, airportCode, geo = {}) => {
  const out = {};
  const seen = new Map(); // rounded "lat,lng" → how many listings already there
  listings.forEach((v) => {
    const { coord, exact } = resolveBaseCoords(v, airportCode, geo);
    let [lat, lng] = coord;
    // Approximate-location pins spread onto a small ring when crowded; exact
    // GPS pins are trusted but still nudged a few metres if two happen to land
    // on the identical point, so no two markers ever perfectly overlap.
    const precision = exact ? 5 : 3;
    const key = `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0 || !exact) {
      const c = Math.min(n, 14); // cap crowding so large fleets stay in a readable cluster
      const radius = exact ? 0.0004 * c : 0.004 + 0.0014 * c; // approx: ~0.4–2.4km ring
      const angle = seeded(v.id) * Math.PI * 2 + n * 2.399963; // golden-angle spread (uses real n)
      lat += Math.cos(angle) * radius;
      lng += Math.sin(angle) * radius;
    }
    out[String(v.id)] = [lat, lng];
  });
  return out;
};

export default function MapSearch() {
  const { state, dispatch } = useApp();
  const { vehicles, reservations, owners = [], theme, searchParams, serviceTab } = state;
  const { t } = useI18n();
  const { currency, format } = useCurrency();
  const mapRef = useRef(null);
  const gmap = useRef(null);
  const googleRef = useRef(null);
  const markers = useRef({});
  const resizeObs = useRef(null); // keeps the map projection in sync with its container size
  const [selectedId, setSelectedId] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [mapMode, setMapMode] = useState('stores'); // 'stores' | 'vehicles'
  const [mapError, setMapError] = useState(false);
  const [view, setView] = useState('split'); // 'split' | 'map' | 'list'
  const [geo, setGeo] = useState({}); // address(lowercased) → [lat,lng] | null (tried, not found)
  const [mapReady, setMapReady] = useState(false);
  const [placeCenter, setPlaceCenter] = useState(null); // {lat,lng} for a free-text location search

  const { cls, query, sort, airportCode, pickup, ret, loc } = searchParams;

  // Geocode the searched place once (free-text / nearby, no airport) so we can
  // both centre the map and keep only the cars within SEARCH_RADIUS_KM of it.
  useEffect(() => {
    let cancelled = false;
    if (!loc || airportCode) { setPlaceCenter(null); return undefined; }
    (async () => {
      try {
        const hit = await geocodeAddress(loc);
        if (!cancelled) setPlaceCenter(hit ? { lat: hit.lat, lng: hit.lng } : null);
      } catch { if (!cancelled) setPlaceCenter(null); }
    })();
    return () => { cancelled = true; };
  }, [loc, airportCode]);

  // Filter vehicles
  let results = vehicles.filter(v => v.status === 'active' && (!v.approvalStatus || v.approvalStatus === 'approved'));
  if (serviceTab === 'p2p')       results = results.filter(v => v.type === 'p2p');
  if (serviceTab === 'corporate') results = results.filter(v => v.type === 'corporate');
  if (cls && cls !== 'all')       results = results.filter(v => normalizeVehicleClass(v.cls) === normalizeVehicleClass(cls));
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(v => v.maker.toLowerCase().includes(q) || v.model.toLowerCase().includes(q));
  }
  // Filter by airport code (set when user clicks airport card on homepage)
  if (airportCode) {
    results = results.filter(v => Array.isArray(v.airports) && v.airports.includes(airportCode));
  }
  // Free-text location search → keep only cars within SEARCH_RADIUS_KM of the
  // searched place. If nothing is nearby, fall back to showing all (so the map
  // is never mysteriously empty).
  if (placeCenter && loc && !airportCode) {
    const near = results.filter(v => {
      const { coord } = resolveBaseCoords(v, airportCode, geo);
      return coord && haversineKm(coord[0], coord[1], placeCenter.lat, placeCenter.lng) <= SEARCH_RADIUS_KM;
    });
    if (near.length > 0) results = near;
  }
  if (sort === 'price_asc')  results = [...results].sort((a, b) => a.priceDay - b.priceDay);
  if (sort === 'price_desc') results = [...results].sort((a, b) => b.priceDay - a.priceDay);
  if (sort === 'rating')     results = [...results].sort((a, b) => b.rating - a.rating);
  const classListings = serviceTab === 'corporate'
    ? buildClassVirtualListings({ vehicles, reservations, owners, pickup, ret, selectedClass: cls, airportCode })
    : [];
  results = [...classListings, ...results.map(v => ({ ...v, listingType: BOOKING_TYPES.SPECIFIC }))];

  // ── 跨区域送车（异地调车）分類 ───────────────────────────────
  // 加盟店からの跨区域送車車両か判定（管理者/加盟オーナーが車両に設定）
  const isPartnerCar = (v) => Boolean(v.deliveryAvailable ?? v.crossRegion ?? v.partnerDelivery);
  const localResults   = results.filter(v => !isPartnerCar(v));
  const partnerResults = results.filter(v =>  isPartnerCar(v));
  // 本地在庫が0で、周辺加盟店に車がある場合のみスマートバナーを表示
  const showCrossRegionBanner = localResults.length === 0 && partnerResults.length > 0;
  // 本地車を上に、加盟店送車を下に並べる
  results = [...localResults, ...partnerResults];

  // Active airport info (for header label)
  const activeAirport = airportCode ? JAPAN_AIRPORTS.find(a => a.code === airportCode) : null;

  // Stable id → coordinate map for the current result set. Recomputed only when
  // the listings, their locations, or the searched airport actually change, so
  // the pin position, the list "fly-to" target and the popup all use the SAME
  // coordinate for a given car — the source of the previous pin↔card mismatch.
  const geoSig = Object.entries(geo)
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : 'x'}`)
    .join('|');
  const coordsSignature = results
    .map(v => `${v.id}@${v.lat ?? ''},${v.lng ?? ''}|${v.loc ?? ''}`)
    .join('~') + `#${airportCode ?? ''}` + `&${geoSig}`;
  const coordsById = useMemo(
    () => buildCoordsById(results, airportCode, geo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordsSignature],
  );
  const ownersSignature = (owners ?? [])
    .map(owner => `${owner.id}:${owner.userId ?? owner.user_id ?? ''}:${owner.storeName ?? owner.store_name ?? ''}:${owner.storeLocation ?? owner.store_location ?? ''}:${owner.status ?? ''}`)
    .join('~');
  const storeSourceSignature = results
    .map(v => [
      v.id,
      v.listingType,
      v.ownerId ?? v.owner_id ?? v.ownerAuthId ?? v.owner_auth_id ?? '',
      v.loc ?? '',
      v.storeName ?? v.store_name ?? v.holder?.name ?? '',
      v.maker ?? '',
      v.priceDay ?? v.price_day ?? '',
      v.classAvailable ?? '',
      v.targetClass ?? v.target_class ?? v.cls ?? '',
    ].join('@'))
    .join('~') + `#${coordsSignature}#${ownersSignature}`;
  const storeGroups = useMemo(
    () => buildStoreMapGroups({ listings: results, coordsById, owners }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeSourceSignature],
  );
  const storeGroupsSignature = storeGroups
    .map(store => `${store.id}:${store.listingCount}:${store.coords?.join(',') ?? ''}`)
    .join('|');
  const effectiveMapMode = mapMode === 'stores' && storeGroups.length === 0 && results.length > 0
    ? 'vehicles'
    : mapMode;

  // ── Geocode vehicle addresses that have no lat/lng ──────────────────────────
  // Many vehicles are stored with only a text address (e.g. "大阪府泉佐野市…")
  // and no coordinates, so they cannot be placed on the map. We geocode each
  // unique address once via the Google Geocoding API, cache the result, and the
  // pins snap to the real location. One request per unique address; a small
  // delay between calls keeps us clear of OVER_QUERY_LIMIT.
  const addressesToGeocode = [...new Set(
    results.filter(v => !(v.lat && v.lng) && v.loc).map(v => normAddr(v.loc)),
  )].filter(a => a && !(a in geo));
  const geocodeKey = addressesToGeocode.join('||');
  useEffect(() => {
    if (addressesToGeocode.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const a of addressesToGeocode.slice(0, 15)) {
        if (cancelled) return;
        try {
          const hit = await geocodeAddress(a);
          if (cancelled) return;
          setGeo(prev => ({
            ...prev,
            [a]: hit ? [hit.lat, hit.lng] : null,
          }));
        } catch {
          if (!cancelled) setGeo(prev => ({ ...prev, [a]: null }));
        }
        await new Promise(r => setTimeout(r, 120)); // gentle spacing for the Geocoding API
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodeKey]);
  // Look up a listing's resolved coordinate (always defined for listed cars).
  const getCoords = (v) => coordsById[String(v?.id)] ?? null;

  const selectedVehicle = effectiveMapMode === 'vehicles' && selectedId != null
    ? results.find(v => String(v.id) === String(selectedId))
    : null;
  const selectedStore = effectiveMapMode === 'stores' && selectedStoreId != null
    ? storeGroups.find(store => String(store.id) === String(selectedStoreId))
    : null;
  const showingStoreList = effectiveMapMode === 'stores' && !selectedStore;
  const visibleResults = selectedStore ? selectedStore.listings : results;

  const selectStore = (store) => {
    setSelectedStoreId(store.id);
    setSelectedId(null);
    if (store.coords && gmap.current) {
      gmap.current.panTo({ lat: store.coords[0], lng: store.coords[1] });
      gmap.current.setZoom(13);
    }
  };

  const clearSelectedStore = () => {
    setSelectedStoreId(null);
  };

  // Init Google Maps
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (gmap.current) return;

    let cancelled = false;
    const initMap = async () => {
      try {
        const google = await loadGoogleMaps();
        if (cancelled || !mapRef.current || gmap.current) return;
        googleRef.current = google;

        gmap.current = new google.maps.Map(mapRef.current, {
          center: { lat: 35.6762, lng: 139.6503 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        // Keep the map's internal projection in sync with the real container
        // size. On desktop the split (list + map) layout only settles a moment
        // after mount — banners, fonts and the list panel finish laying out —
        // so the map is often created against an interim size. Google Maps does
        // not re-measure on its own, which makes every pin sit a fixed distance
        // off its true point (the "場所がずれる" symptom seen only on the web /
        // desktop layout; mobile fills a fixed-height box immediately so it was
        // never affected). A ResizeObserver fires once on observe (giving an
        // initial correction) and again on any later size change; we re-trigger
        // Google's 'resize' and restore the centre so pins snap back onto their
        // real coordinates.
        if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
          let raf = 0;
          resizeObs.current = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const g = googleRef.current;
              const m = gmap.current;
              if (!g || !m) return;
              const center = m.getCenter();
              g.maps.event.trigger(m, 'resize');
              if (center) m.setCenter(center);
            });
          });
          resizeObs.current.observe(mapRef.current);
        }

        updateMarkers();
        setMapReady(true);
      } catch (e) {
        console.error('Google Maps init failed:', e);
        setMapError(true);
      }
    };

    initMap();
    return () => {
      cancelled = true;
      resizeObs.current?.disconnect?.();
      resizeObs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when results change
  const updateMarkers = () => {
    const google = googleRef.current;
    if (!google || !gmap.current) return;

    // Clear old markers
    Object.values(markers.current).forEach(m => m.setMap(null));
    markers.current = {};

    if (effectiveMapMode === 'stores') {
      storeGroups.forEach(store => {
        if (!store.coords) return;
        const isSelected = String(store.id) === String(selectedStoreId);
        const marker = new google.maps.Marker({
          position: { lat: store.coords[0], lng: store.coords[1] },
          map: gmap.current,
          icon: priceMarkerIcon(google, store.markerLabel, isSelected),
          zIndex: isSelected ? 1000 : 1,
          optimized: false,
        });
        marker.addListener('click', () => selectStore(store));
        markers.current[String(store.id)] = marker;
      });
      return;
    }

    results.forEach(v => {
      const coords = getCoords(v);
      if (!coords) return;

      const isSelected = String(v.id) === String(selectedId);

      // Selected marker sits above the rest so overlapping pins never hide it
      // and its click always maps back to the same card.
      const marker = new google.maps.Marker({
        position: { lat: coords[0], lng: coords[1] },
        map: gmap.current,
        icon: priceMarkerIcon(google, format(v.priceDay), isSelected),
        zIndex: isSelected ? 1000 : 1,
        optimized: false,
      });
      marker.addListener('click', () => setSelectedId(v.id));

      markers.current[String(v.id)] = marker;
    });
  };

  useEffect(() => {
    updateMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsSignature, storeGroupsSignature, selectedId, selectedStoreId, currency, effectiveMapMode]);

  // Frame the map to the current result pins so the map always matches the cars
  // shown in the list. Falls back to the searched airport/place when there are
  // no plottable pins yet.
  const fitToResults = () => {
    const g = googleRef.current;
    if (!g || !gmap.current) return;

    // 1) A searched airport → centre on it.
    const ap = airportCode ? JAPAN_AIRPORTS.find(a => a.code === airportCode) : null;
    if (ap) { gmap.current.panTo({ lat: ap.lat, lng: ap.lng }); gmap.current.setZoom(12); return; }

    // 2) A searched place name (free text / nearby) → centre on it.
    if (placeCenter) { gmap.current.panTo({ lat: placeCenter.lat, lng: placeCenter.lng }); gmap.current.setZoom(12); return; }

    // 3) No place searched → frame all visible map pins.
    const pts = effectiveMapMode === 'stores'
      ? storeGroups.map(store => store.coords).filter(Boolean)
      : results.map(getCoords).filter(Boolean);
    if (pts.length >= 2) {
      const bounds = new g.maps.LatLngBounds();
      pts.forEach(([la, ln]) => bounds.extend({ lat: la, lng: ln }));
      gmap.current.fitBounds(bounds, 64);
      const z = gmap.current.getZoom();
      if (typeof z === 'number' && z > 15) gmap.current.setZoom(15);
    } else if (pts.length === 1) {
      gmap.current.panTo({ lat: pts[0][0], lng: pts[0][1] });
      gmap.current.setZoom(13);
    }
  };

  // Re-frame on a new search (airport / place / class / service) and once the
  // map is ready. A short delay lets the result coordinates settle first.
  useEffect(() => {
    if (!mapReady) return;
    const id = setTimeout(() => { fitToResults(); }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, airportCode, placeCenter, cls, serviceTab, geoSig, effectiveMapMode, storeGroupsSignature]);

  // View change resizes the map container; nudge Google Maps to re-render and
  // keep the current center so the map does not appear blank or off-centre.
  useEffect(() => {
    const google = googleRef.current;
    if (!google || !gmap.current) return;
    const center = gmap.current.getCenter();
    setTimeout(() => {
      google.maps.event.trigger(gmap.current, 'resize');
      if (center) gmap.current.setCenter(center);
    }, 120);
  }, [view, effectiveMapMode]);

  // Select a car from the list/sheet: highlight it and fly the map to its pin.
  const selectVehicle = (v) => {
    if (effectiveMapMode === 'stores') {
      setMapMode('vehicles');
      setSelectedStoreId(null);
    }
    setSelectedId(v.id);
    const coords = getCoords(v);
    if (coords && gmap.current) {
      gmap.current.panTo({ lat: coords[0], lng: coords[1] });
      gmap.current.setZoom(14);
    }
  };

  const openBooking = (v) => {
    dispatch({
      type: 'SET_BOOKING',
      b: {
        vehicleId: v.listingType === BOOKING_TYPES.CLASS_BASED ? null : v.id,
        vehicle: v,
        bookingType: v.listingType ?? BOOKING_TYPES.SPECIFIC,
        targetClass: v.targetClass ?? v.cls,
        step: 1,
        type: v.type,
        pickup: pickup || '',
        ret: ret || '',
        datePreset: Boolean(pickup && ret),
        pickupLoc: v.listingType === BOOKING_TYPES.CLASS_BASED ? (v.loc ?? '') : '',
        opts: {},
        name: state.currentUser?.name ?? '',
        email: state.currentUser?.email ?? '',
        phone: state.currentUser?.phone || '',
        info: { name: state.currentUser?.name ?? '', email: state.currentUser?.email ?? '', phone: state.currentUser?.phone || '' },
      },
    });
  };

  const openChat = (v) => {
    const ownerId = chatOwnerIdOf(v);
    if (!state.currentUser) {
      dispatch({ type: 'SET_AUTH', open: true, mode: 'login' });
      return;
    }
    if (!canPreBookingChat(v)) {
      dispatch({ type: 'TOAST', msg: t('ownerChatUnavailable') });
      return;
    }
    window.__openChat?.({ ...v, ownerId, img_url: v.img_url ?? v.img });
  };

  const listIsEmpty = showingStoreList ? storeGroups.length === 0 : visibleResults.length === 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-hidden md:h-[calc(100dvh-4rem)] md:overflow-hidden">
      {/* 跨区域送车 スマートバナー（黒金スタイル）— 本地在庫0 & 加盟店在庫ありのとき */}
      {showCrossRegionBanner && (
        <div className="px-4 py-3 border-b border-amber-900/40"
             style={{ background: 'linear-gradient(135deg, #1a1206, #2a1d08)' }}>
          <div className="flex items-start gap-3 max-w-5xl mx-auto">
            <span className="text-2xl flex-shrink-0">💡</span>
            <div className="min-w-0">
              <p className="font-black text-sm" style={{ color: '#f5d77a' }}>{t('crossRegionBannerTitle')}</p>
              <p className="text-amber-100/80 text-xs mt-0.5 leading-relaxed">{t('crossRegionBannerBody')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Airport filter banner */}
      {activeAirport && (
        <div className="flex items-center gap-3 px-4 py-2 bg-purple-50 border-b border-purple-100">
          <span className="text-lg">{activeAirport.emoji}</span>
          <div className="flex-1">
            <span className="text-purple-800 font-semibold text-sm">{activeAirport.code} — {activeAirport.name}</span>
            <span className="text-purple-500 text-xs ml-2">{results.length} {t('results')}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'SET_SEARCH', patch: { airportCode: '' } })}
            className="text-xs text-purple-600 hover:text-purple-800 font-semibold px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors"
          >
            ✕ {t('clear') || 'Clear'}
          </button>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-col gap-3 px-3 py-3 bg-white border-b border-gray-100 sm:px-4 md:flex-row md:items-center">
        {/* Class filters */}
        <div className="flex gap-1.5 flex-1 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {VEHICLE_CLASSES.map(c => (
            <button
              key={c.id}
              onClick={() => dispatch({ type: 'SET_SEARCH', patch: { cls: c.id } })}
              className={`flex flex-shrink-0 items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                cls === c.id
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-700 bg-white'
              }`}
            >
              {c.id === 'all' ? `${c.icon} ${c.label}` : c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-start">
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden flex-shrink-0">
            {[
              { v: 'stores', label: t('ms_storePins') },
              { v: 'vehicles', label: t('ms_vehiclePins') },
            ].map(btn => (
              <button
                key={btn.v}
                onClick={() => {
                  setMapMode(btn.v);
                  setSelectedId(null);
                  setSelectedStoreId(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  effectiveMapMode === btn.v ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* View toggle (desktop only — mobile uses the Airbnb-style bottom sheet) */}
          <div className="hidden items-center border border-gray-200 rounded-xl overflow-hidden flex-shrink-0 md:flex">
            {[
              { v: 'list', icon: '≡', label: t('listView') },
              { v: 'split', icon: '⊞', label: 'Split' },
              { v: 'map',  icon: '🗺', label: t('mapView') },
            ].map(btn => (
              <button
                key={btn.v}
                onClick={() => setView(btn.v)}
                title={btn.label}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  view === btn.v ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {btn.icon}
              </button>
            ))}
          </div>

          <p className="text-gray-500 text-sm flex-shrink-0">
            {showingStoreList
              ? t('ms_storeCount').replace('{n}', storeGroups.length)
              : `${visibleResults.length} ${t('results')}`}
          </p>
        </div>
      </div>

      {/* Main area */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row md:min-h-[600px]">
        {/* Desktop list panel (mobile uses the bottom sheet instead) */}
        <div className={`hidden ${view === 'map' ? 'md:hidden' : 'md:block'} md:w-[420px] overflow-y-auto bg-gray-50 border-gray-100 md:border-r`}>
          {listIsEmpty ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p>{t('noResults')}</p>
            </div>
          ) : showingStoreList ? (
            storeGroups.map(store => (
              <StoreListCard
                key={store.id}
                store={store}
                selected={String(store.id) === String(selectedStoreId)}
                onClick={() => selectStore(store)}
                t={t}
              />
            ))
          ) : (
            <>
              {selectedStore && (
                <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={clearSelectedStore}
                    className="mb-2 text-xs font-bold text-purple-700 hover:text-purple-900"
                  >
                    ← {t('ms_backToStores')}
                  </button>
                  <p className="truncate text-sm font-black text-gray-900">{selectedStore.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {selectedStore.location || t('ms_storePins')} · {t('ms_storeVehicles').replace('{n}', selectedStore.listingCount)}
                  </p>
                </div>
              )}
              {visibleResults.map(v => (
                <MapVehicleCard
                  key={v.id}
                  vehicle={v}
                  selected={String(v.id) === String(selectedId)}
                  onClick={() => selectVehicle(v)}
                  onBook={() => openBooking(v)}
                  onChat={() => openChat(v)}
                  t={t}
                  theme={theme}
                />
              ))}
            </>
          )}
        </div>

        {/* Map panel — single shared map instance for mobile & desktop */}
        <div className={`relative flex-1 ${view === 'list' ? 'md:hidden' : 'md:block'} h-[56vh] md:h-auto md:min-h-[600px]`}>
          <div ref={mapRef} className="absolute inset-0 h-full w-full md:static md:h-full md:min-h-[600px]" />

          {/* Map failed to load (missing key / billing / network) */}
          {mapError && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-gray-50 p-6 text-center">
              <div className="max-w-xs">
                <div className="text-4xl mb-3">🗺️</div>
                <p className="text-gray-700 font-semibold text-sm">{t('ms_mapLoadError')}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {t('ms_mapLoadHint')}
                </p>
              </div>
            </div>
          )}

          {/* Desktop hint */}
          {!selectedId && !selectedStore && (
            <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="bg-white/90 backdrop-blur-sm text-gray-600 text-xs px-4 py-2 rounded-full shadow border border-gray-100">
                {t('clickPin')}
              </div>
            </div>
          )}

          {/* Desktop selected store card */}
          {effectiveMapMode === 'stores' && selectedStore && (
            <div className="hidden md:block absolute bottom-6 left-1/2 z-[1000] w-80 -translate-x-1/2">
              <StoreSelectedCard
                store={selectedStore}
                onClose={clearSelectedStore}
                onViewVehicles={() => {
                  const first = selectedStore.listings[0];
                  if (first) selectVehicle(first);
                }}
                t={t} format={format} currency={currency}
              />
            </div>
          )}

          {/* Desktop selected card */}
          {selectedVehicle && (
            <div className="hidden md:block absolute bottom-6 left-1/2 z-[1000] w-80 -translate-x-1/2">
              <SelectedCard
                v={selectedVehicle}
                onClose={() => setSelectedId(null)}
                onBook={() => openBooking(selectedVehicle)}
                onChat={() => openChat(selectedVehicle)}
                t={t} format={format} currency={currency}
              />
            </div>
          )}

          {/* Mobile selected store card */}
          {effectiveMapMode === 'stores' && selectedStore && (
            <div className="md:hidden absolute inset-x-3 z-[1200] animate-[sheetUp_.25s_ease-out] bottom-[calc(env(safe-area-inset-bottom)+72px)]">
              <StoreSelectedCard
                store={selectedStore}
                onClose={clearSelectedStore}
                onViewVehicles={() => {
                  const first = selectedStore.listings[0];
                  if (first) selectVehicle(first);
                }}
                t={t} format={format} currency={currency}
                compact
              />
            </div>
          )}

          {/* Mobile: Airbnb-style card that pops up from the bottom on pin tap */}
          {selectedVehicle && (
            <div className="md:hidden absolute inset-x-3 z-[1200] animate-[sheetUp_.25s_ease-out] bottom-[calc(env(safe-area-inset-bottom)+72px)]">
              <SelectedCard
                v={selectedVehicle}
                onClose={() => setSelectedId(null)}
                onBook={() => openBooking(selectedVehicle)}
                onChat={() => openChat(selectedVehicle)}
                t={t} format={format} currency={currency}
                compact
              />
            </div>
          )}

          {/* Mobile: draggable bottom sheet with the car list */}
          <MobileSheet
            results={visibleResults}
            storeGroups={storeGroups}
            selectedStore={selectedStore}
            showingStoreList={showingStoreList}
            selectedId={selectedId}
            selectedStoreId={selectedStoreId}
            onSelect={selectVehicle}
            onSelectStore={selectStore}
            onBackToStores={clearSelectedStore}
            onBook={openBooking}
            onChat={openChat}
            t={t}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}

// ── Airbnb-style bottom sheet (mobile) ────────────────────────────────────────
// Full-screen map with a draggable sheet that snaps between a peek header, a
// half view and a full list. Dragging the handle/header moves the sheet; the
// inner list scrolls independently once expanded.
function MobileSheet({
  results,
  storeGroups,
  selectedStore,
  showingStoreList,
  selectedId,
  selectedStoreId,
  onSelect,
  onSelectStore,
  onBackToStores,
  onBook,
  onChat,
  t,
  theme,
}) {
  const sheetRef = useRef(null);
  const [snaps, setSnaps] = useState({ full: 0, half: 300, collapsed: 520 });
  const [translate, setTranslate] = useState(520);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startY: 0, startT: 0, moved: 0 });
  const sheetCountLabel = showingStoreList
    ? (storeGroups.length > 0 ? t('ms_storeCount').replace('{n}', storeGroups.length) : t('noResults'))
    : selectedStore
      ? `${selectedStore.name} · ${t('ms_storeVehicles').replace('{n}', results.length)}`
      : (results.length > 0 ? t('ms_vehicleCount').replace('{n}', results.length) : t('noResults'));

  // Compute snap offsets from the sheet's real height.
  const recomputeSnaps = () => {
    const h = sheetRef.current?.offsetHeight ?? 0;
    if (!h) return;
    const PEEK = 84; // visible height when collapsed (handle + count header)
    const next = { full: 0, half: Math.round(h * 0.46), collapsed: Math.max(0, h - PEEK) };
    setSnaps(next);
    setTranslate((prev) => (prev > next.collapsed ? next.collapsed : prev));
  };

  useEffect(() => {
    recomputeSnaps();
    const onResize = () => recomputeSnaps();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start collapsed once we know the height.
  useEffect(() => {
    setTranslate(snaps.collapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps.collapsed]);

  // Collapse to reveal the pin card whenever a car is selected on the map.
  useEffect(() => {
    if (selectedId != null) setTranslate(snaps.collapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const snapTo = (y) => {
    const pts = [snaps.full, snaps.half, snaps.collapsed];
    const nearest = pts.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), pts[0]);
    setTranslate(nearest);
  };

  const onPointerDown = (e) => {
    setDragging(true);
    drag.current = { startY: e.clientY, startT: translate, moved: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - drag.current.startY;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dy));
    const y = Math.min(snaps.collapsed, Math.max(snaps.full, drag.current.startT + dy));
    setTranslate(y);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    // A tap (barely moved) on the collapsed header expands to half.
    if (drag.current.moved < 6 && translate >= snaps.collapsed - 4) {
      setTranslate(snaps.half);
    } else {
      snapTo(translate);
    }
  };

  return (
    <div className="md:hidden pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+62px)] z-[1100] max-h-[34vh] overflow-hidden">
      <div
        ref={sheetRef}
        className="pointer-events-auto relative inset-x-0 bottom-0 flex max-h-[34vh] flex-col rounded-t-3xl border-t border-gray-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.18)] will-change-transform"
        style={{
          transform: `translateY(${translate}px)`,
          transition: dragging ? 'none' : 'transform .3s cubic-bezier(.32,.72,0,1)',
        }}
      >
        {/* Drag handle + count header */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 cursor-grab touch-none select-none rounded-t-3xl pt-2.5 pb-2 active:cursor-grabbing"
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-300" />
          <p className="mt-2 text-center text-[15px] font-bold text-gray-900">
            {sheetCountLabel}
          </p>
        </div>

        {/* Scrollable list */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          {showingStoreList ? (
            storeGroups.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <div className="mb-3 text-4xl">🔍</div>
                <p>{t('noResults')}</p>
              </div>
            ) : storeGroups.map(store => (
              <StoreListCard
                key={store.id}
                store={store}
                selected={String(store.id) === String(selectedStoreId)}
                onClick={() => onSelectStore(store)}
                t={t}
              />
            ))
          ) : results.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="mb-3 text-4xl">🔍</div>
              <p>{t('noResults')}</p>
            </div>
          ) : (
            <>
              {selectedStore && (
                <div className="border-b border-gray-100 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={onBackToStores}
                    className="mb-2 text-xs font-bold text-purple-700"
                  >
                    ← {t('ms_backToStores')}
                  </button>
                  <p className="truncate text-sm font-black text-gray-900">{selectedStore.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {selectedStore.location || t('ms_storePins')} · {t('ms_storeVehicles').replace('{n}', selectedStore.listingCount)}
                  </p>
                </div>
              )}
              {results.map(v => (
                <MapVehicleCard
                  key={v.id}
                  vehicle={v}
                  selected={String(v.id) === String(selectedId)}
                  onClick={() => onSelect(v)}
                  onBook={() => onBook(v)}
                  onChat={() => onChat(v)}
                  t={t}
                  theme={theme}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StoreListCard({ store, selected, onClick, t }) {
  const { currency, format } = useCurrency();
  const classSummary = store.classLabels.length > 0
    ? store.classLabels.slice(0, 3).join(' / ')
    : t('ms_classTbd');
  const extraClasses = Math.max(0, store.classLabels.length - 3);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full gap-3 border-b border-gray-100 p-3 text-left transition-all hover:bg-white sm:p-4 ${
        selected ? 'border-l-4 border-l-purple-500 bg-white' : 'bg-gray-50'
      }`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple-600 text-lg font-black text-white shadow-sm">
        {store.listingCount}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-gray-900">{store.name}</p>
            <p className="truncate text-xs text-gray-500">{store.location || t('ms_storePins')}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-black text-purple-700">{format(store.minPriceDay)}</p>
            <p className="text-[11px] text-gray-400">{t('perDay')}</p>
            {currency !== 'JPY' && (
              <p className="text-[10px] text-gray-400">¥{store.minPriceDay.toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className="rounded-md bg-purple-50 px-2 py-1 text-purple-700">
            {t('ms_storeVehicles').replace('{n}', store.listingCount)}
          </span>
          {store.classPlanCount > 0 && (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
              {t('ms_storeClassPlans').replace('{n}', store.classPlanCount)}
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-xs text-gray-500">
          {classSummary}{extraClasses > 0 ? ` +${extraClasses}` : ''}
        </p>
      </div>
    </button>
  );
}

function StoreSelectedCard({ store, onClose, onViewVehicles, t, format, currency, compact }) {
  const classSummary = store.classLabels.length > 0
    ? store.classLabels.slice(0, 3).join(' / ')
    : t('ms_classTbd');
  const extraClasses = Math.max(0, store.classLabels.length - 3);
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
      <div className={`p-4 ${compact ? 'pb-3' : ''}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-gray-900">{store.name}</p>
            <p className="truncate text-xs text-gray-500">{store.location || t('ms_storePins')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gray-50 p-2">
            <p className="text-[11px] font-bold text-gray-400">{t('ms_vehiclePins')}</p>
            <p className="text-sm font-black text-gray-900">{store.listingCount}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2">
            <p className="text-[11px] font-bold text-gray-400">{t('ms_classPlansLabel')}</p>
            <p className="text-sm font-black text-gray-900">{store.classPlanCount}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2">
            <p className="text-[11px] font-bold text-gray-400">{t('ms_fromPrice')}</p>
            <p className="text-sm font-black text-purple-700">{format(store.minPriceDay)}</p>
          </div>
        </div>
        {currency !== 'JPY' && (
          <p className="mt-1 text-right text-[11px] text-gray-400">¥{store.minPriceDay.toLocaleString()}</p>
        )}
        <p className="mt-3 truncate text-xs text-gray-500">
          {classSummary}{extraClasses > 0 ? ` +${extraClasses}` : ''}
        </p>
        {store.classAvailable > 0 && (
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            {t('ms_availAwaiting').replace('{n}', store.classAvailable)}
          </p>
        )}
        <button
          type="button"
          onClick={onViewVehicles}
          className="mt-4 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-black text-white transition-colors hover:bg-purple-700"
        >
          {t('ms_viewVehiclePins')}
        </button>
      </div>
    </div>
  );
}

// ── Selected vehicle card (shared by desktop overlay & mobile pop-up) ──────────
function SelectedCard({ v, onClose, onBook, onChat, t, format, currency, compact }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
      <div className="relative">
        <img
          src={v.img}
          alt={v.model}
          className={`w-full object-contain bg-gray-100 ${compact ? 'h-32' : 'h-40'}`}
        />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-sm text-white hover:bg-black/70"
        >×</button>
        {v.badge && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-1 text-xs font-bold text-white"
            style={{ background: v.badgeBg || '#7C3AED' }}
          >
            {v.badge}
          </span>
        )}
      </div>
      <div className="p-3 md:p-4">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900 md:text-base">
              {v.listingType === BOOKING_TYPES.CLASS_BASED
                ? `${classLabel(v.targetClass)} ${t('bm_omakase')}`
                : `${v.maker} ${v.model}`}
            </p>
            <p className="text-xs text-gray-500">
              {v.listingType === BOOKING_TYPES.CLASS_BASED
                ? t('ms_availAwaiting').replace('{n}', v.classAvailable)
                : `${v.year} · ${v.loc}`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-base font-bold text-purple-700 md:text-lg">{format(v.priceDay)}</span>
            <p className="text-xs text-gray-400">{t('perDay')}</p>
            {currency !== 'JPY' && (
              <p className="text-[11px] text-gray-400">¥{v.priceDay.toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="mb-2 flex gap-2 text-xs text-gray-500 md:mb-3">
          <span>👤 {v.pax}</span>
          <span>⛽ {v.fuel}</span>
          {Number(v.rating) > 0 && (
            <Stars rating={v.rating} count={v.reviews} className="text-xs" />
          )}
        </div>
        <div className="flex gap-2">
          {canPreBookingChat(v) && (
            <button
              onClick={onChat}
              className="flex-1 rounded-xl border border-purple-200 bg-purple-50 py-2 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-100 md:py-2.5"
            >
              💬 {t('askOwnerCta') || t('ms_ask')}
            </button>
          )}
          <button
            onClick={onBook}
            className="flex-1 rounded-xl bg-purple-600 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 md:py-2.5"
          >
            {t('bookNow')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Star rating display (★★★★★ + score + review count) ──────────────────────
function Stars({ rating, count, className = '' }) {
  const score = Number(rating) || 0;
  const full = Math.min(5, Math.max(0, Math.round(score)));
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="leading-none tracking-tight">
        <span className="text-amber-400">{'★'.repeat(full)}</span>
        <span className="text-gray-300">{'★'.repeat(5 - full)}</span>
      </span>
      {score > 0 && <span className="text-gray-600 font-medium">{score.toFixed(1)}</span>}
      {Number(count) > 0 && <span className="text-gray-400">({count})</span>}
    </span>
  );
}

// ── Compact vehicle card for the list panel ───────────────────────────────────
function MapVehicleCard({ vehicle: v, selected, onClick, onBook, onChat, t, theme }) {
  const { currency, format } = useCurrency();
  const isClassBased = v.listingType === BOOKING_TYPES.CLASS_BASED;
  const isPartner = Boolean(v.deliveryAvailable ?? v.crossRegion ?? v.partnerDelivery);
  const etaHours = Number(v.deliveryEtaHours ?? v.advanceHours ?? 0);
  const oneWay = Boolean(v.oneWayReturn ?? v.oneway ?? v.allowOneWay ?? v.oneWayEnabled);
  return (
    <div
      onClick={onClick}
      className={`flex gap-2.5 p-2.5 cursor-pointer border-b border-gray-100 transition-all hover:bg-white sm:gap-3 sm:p-4 ${
        selected ? 'bg-white border-l-4 border-l-purple-500' : isClassBased ? 'bg-purple-50/70' : 'bg-transparent'
      }`}
    >
      <div className="relative flex-shrink-0">
        <img
          src={v.img || 'https://via.placeholder.com/96x72?text=Car'}
          alt={v.model}
          className="h-24 w-32 object-contain bg-gray-100 rounded-xl md:h-36 md:w-48"
        />
        {isClassBased && (
          <span className="absolute -top-1 -left-1 rounded-lg bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">
            Deal
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {/* 本地 / 加盟店送車 タグ */}
        <div className="flex flex-wrap items-center gap-1 mb-1">
          {isPartner ? (
            <span className="rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
              🚚 {t('tagPartnerCar')}{etaHours > 0 ? ` · ${t('advanceBookingHours').replace('{h}', etaHours)}` : ''}
            </span>
          ) : (
            <span className="rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold">
              ✅ {t('tagLocalCar')}
            </span>
          )}
          {oneWay && (
            <span className="rounded-md bg-purple-100 text-purple-800 border border-purple-300 px-1.5 py-0.5 text-[10px] font-bold">
              ↔ {t('oneWayReturnAvailable')}
            </span>
          )}
          {canPreBookingChat(v) && (
            <span className="rounded-md bg-sky-100 text-sky-800 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold">
              💬 {t('askOwnerCta') || t('ms_ask')}
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">
              {isClassBased ? `${classLabel(v.targetClass)} ${t('ms_omakasePlan')}` : `${v.maker} ${v.model}`}
            </p>
            <p className="text-gray-400 text-xs leading-tight">
              {isClassBased ? `${v.maker} · ${t('ms_availFleet').replace('{a}', v.classAvailable).replace('{b}', v.fleetTotal)}` : `${v.year} · ${(v.loc ?? '').split(',')[0]}`}
            </p>
            {isPartner && etaHours > 0 && (
              <p className="text-amber-600 text-[11px] font-semibold leading-tight mt-0.5">
                ⏱ {t('deliveryEtaHours').replace('{h}', etaHours)}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-purple-700 text-sm sm:text-base">{format(v.priceDay)}</p>
            <p className="text-gray-400 text-xs">{t('perDay')}</p>
            {currency !== 'JPY' && (
              <p className="text-gray-400 text-[10px]">¥{v.priceDay.toLocaleString()}</p>
            )}
            {isClassBased && v.originalPriceDay > v.priceDay && (
              <p className="text-[10px] text-gray-400 line-through">{format(v.originalPriceDay)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5 sm:mt-2">
          <div className="flex gap-2 text-xs text-gray-500">
            <span>👤 {v.pax}</span>
            {Number(v.rating) > 0
              ? <Stars rating={v.rating} count={v.reviews} className="text-xs" />
              : <span>{isClassBased ? t('ms_classTbd') : '—'}</span>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {canPreBookingChat(v) && (
              <button
                onClick={e => { e.stopPropagation(); onChat(); }}
                className="text-xs border border-purple-200 bg-purple-50 text-purple-700 px-2.5 py-1.5 rounded-lg font-semibold transition-colors hover:bg-purple-100"
                aria-label={t('askOwnerCta') || t('ms_ask')}
              >
                💬
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onBook(); }}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-lg font-semibold transition-colors sm:px-3"
            >
              {t('bookNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
