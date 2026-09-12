'use client';
/**
 * AdminMapPicker — Interactive Google Maps for setting vehicle location in admin.
 *
 * Usage:
 *   <AdminMapPicker lat={v.lat} lng={v.lng} onChange={({ lat, lng, address }) => ...} />
 *
 * - Click anywhere on the map to drop / move the pin
 * - Drag the existing pin to fine-tune
 * - Address search box uses the Google Geocoding API
 * - Reverse geocodes the pin position to fill address automatically
 *
 * 必要な環境変数: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 */
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, geocodeAddress, reverseGeocode } from '../lib/googleMaps';

const JAPAN_CENTER = { lat: 35.6762, lng: 139.6503 }; // Tokyo
const DEFAULT_ZOOM = 12;

// 紫のティアドロップ型ピン（元 Leaflet 版と同じ見た目）
const PIN_SVG =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30" width="36" height="44">' +
    '<path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z" fill="#7C3AED"/>' +
    '<circle cx="12" cy="8" r="3" fill="white"/></svg>'
  );

export default function AdminMapPicker({ lat, lng, onChange }) {
  const mapRef     = useRef(null);
  const googleRef  = useRef(null); // google namespace
  const mapObjRef  = useRef(null); // google.maps.Map instance
  const markerRef  = useRef(null); // google.maps.Marker instance
  const [query,     setQuery]     = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [mapError,  setMapError]  = useState(false);
  const [coords,    setCoords]    = useState(
    lat && lng ? { lat: +lat, lng: +lng } : null
  );

  // ── Load Google Maps once ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || mapObjRef.current) return;
    let cancelled = false;

    const init = async () => {
      try {
        const google = await loadGoogleMaps();
        if (cancelled || !mapRef.current || mapObjRef.current) return;
        googleRef.current = google;

        const center = coords ? { lat: coords.lat, lng: coords.lng } : JAPAN_CENTER;
        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        mapObjRef.current = map;

        // Place initial marker if coords exist
        if (coords) placeMarker(google, map, coords.lat, coords.lng);

        // Click on map → drop pin
        map.addListener('click', (e) => {
          const clickLat = e.latLng.lat();
          const clickLng = e.latLng.lng();
          placeMarker(google, map, clickLat, clickLng);
          const newCoords = { lat: +clickLat.toFixed(6), lng: +clickLng.toFixed(6) };
          setCoords(newCoords);
          doReverseGeocode(clickLat, clickLng);
          onChange({ lat: newCoords.lat, lng: newCoords.lng });
        });
      } catch (err) {
        console.error('AdminMapPicker: Google Maps init failed', err);
        if (!cancelled) setMapError(true);
      }
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Place / move draggable marker ─────────────────────────────────────────
  function placeMarker(google, map, mLat, mLng) {
    if (markerRef.current) markerRef.current.setMap(null);

    const marker = new google.maps.Marker({
      position: { lat: +mLat, lng: +mLng },
      map,
      draggable: true,
      icon: {
        url: PIN_SVG,
        scaledSize: new google.maps.Size(36, 44),
        anchor: new google.maps.Point(18, 44),
      },
    });

    marker.addListener('dragend', (e) => {
      const posLat = e.latLng.lat();
      const posLng = e.latLng.lng();
      const newCoords = { lat: +posLat.toFixed(6), lng: +posLng.toFixed(6) };
      setCoords(newCoords);
      doReverseGeocode(posLat, posLng);
      onChange({ lat: newCoords.lat, lng: newCoords.lng });
    });

    markerRef.current = marker;
  }

  // ── Reverse geocode (coords → address string) ─────────────────────────────
  async function doReverseGeocode(rLat, rLng) {
    try {
      const formatted = await reverseGeocode(rLat, rLng);
      if (formatted) {
        // 日本の formatted_address は「日本、〒… 都道府県市区町村…」形式。
        // 郵便番号・「日本」を除いて読みやすく整える。
        const short = formatted
          .replace(/^日本、?\s*/, '')
          .replace(/〒?\d{3}-?\d{4}\s*/, '')
          .trim();
        onChange({ lat: +rLat.toFixed(6), lng: +rLng.toFixed(6), address: short || formatted });
        setQuery(short || formatted);
      }
    } catch { /* silent */ }
  }

  // ── Forward geocode (address → coords) ────────────────────────────────────
  const searchAddress = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr('');
    try {
      const hit = await geocodeAddress(query);
      if (hit) {
        const google = googleRef.current;
        const map = mapObjRef.current;
        const newCoords = { lat: +hit.lat.toFixed(6), lng: +hit.lng.toFixed(6) };
        setCoords(newCoords);
        map?.panTo({ lat: hit.lat, lng: hit.lng });
        map?.setZoom(15);
        if (google && map) placeMarker(google, map, hit.lat, hit.lng);
        onChange({ lat: newCoords.lat, lng: newCoords.lng, address: query });
      } else {
        setSearchErr('場所が見つかりません。もう少し詳しく入力してください。');
      }
    } catch {
      setSearchErr('検索に失敗しました。');
    } finally {
      setSearching(false);
    }
  };

  const clearPin = () => {
    if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
    setCoords(null);
    setQuery('');
    onChange({ lat: null, lng: null, address: '' });
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchAddress()}
          placeholder="住所を検索 / Search address…"
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={searchAddress}
          disabled={searching || !query.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          {searching
            ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : '🔍'
          }
          {searching ? '検索中…' : '検索'}
        </button>
      </div>
      {searchErr && <p className="text-red-400 text-xs">{searchErr}</p>}

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border border-gray-700" style={{ height: '280px' }}>
        <div ref={mapRef} className="w-full h-full" />

        {/* Map failed to load */}
        {mapError && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-gray-900/95 p-4 text-center">
            <div>
              <div className="text-3xl mb-2">🗺️</div>
              <p className="text-white text-sm font-semibold">地図を読み込めませんでした</p>
              <p className="text-gray-400 text-xs mt-1">
                Google Maps API キー・課金設定をご確認ください。
              </p>
            </div>
          </div>
        )}

        {/* Hint overlay (shown until pin is placed) */}
        {!coords && !mapError && (
          <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-4 z-[999]">
            <div className="bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full border border-white/10">
              🗺 地図をクリックしてピンを置く · Click map to drop pin
            </div>
          </div>
        )}

        {/* Coords badge + clear */}
        {coords && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-[999] pointer-events-none">
            <span className="bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg font-mono pointer-events-none">
              📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            <button
              onClick={clearPin}
              className="pointer-events-auto bg-red-600/80 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              ✕ クリア
            </button>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs">
        ピンをドラッグして位置を微調整できます · Drag pin to fine-tune position
      </p>
    </div>
  );
}
