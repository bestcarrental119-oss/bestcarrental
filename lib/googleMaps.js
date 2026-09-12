// lib/googleMaps.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Maps JavaScript API の共通ローダー & ジオコーディングヘルパー。
//
// これまで各コンポーネントが個別に Leaflet + OpenStreetMap を読み込んでいた処理を
// ここへ集約する。API キーは環境変数 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY から取得。
//
//   import { loadGoogleMaps, geocodeAddress, reverseGeocode } from '../lib/googleMaps';
//   const google = await loadGoogleMaps();
//
// 必要な API（Google Cloud で有効化）:
//   - Maps JavaScript API   … 地図表示
//   - Geocoding API         … 住所⇄座標変換（Geocoder は JS API 経由で課金）
// ─────────────────────────────────────────────────────────────────────────────

let loadPromise = null;

/** 環境変数から API キーを取得（未設定なら空文字） */
export function getGoogleMapsKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

/** API キーが設定されているか */
export function hasGoogleMapsKey() {
  return Boolean(getGoogleMapsKey());
}

export function focusMapOnCoordinates({ google, map, position, zoom = 17 }) {
  if (!map || position?.lat == null || position?.lng == null) return false;
  const pos = { lat: Number(position.lat), lng: Number(position.lng) };
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return false;

  google?.maps?.event?.trigger?.(map, 'resize');
  map.setCenter?.(pos);
  map.panTo?.(pos);

  const currentZoom = typeof map.getZoom === 'function' ? Number(map.getZoom()) : 0;
  const nextZoom = Math.max(Number.isFinite(currentZoom) ? currentZoom : 0, zoom);
  map.setZoom?.(nextZoom);
  return true;
}

async function geocodeAddressViaServer(address) {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, formatted: data.formatted || address };
  } catch {
    return null;
  }
}

/**
 * Google Maps JS API を一度だけ読み込む。以降は同じ Promise を返す（多重読み込み防止）。
 * @returns {Promise<typeof google>}
 */
export function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadGoogleMaps must run in the browser'));
  }
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) return loadPromise;

  const key = getGoogleMapsKey();

  loadPromise = new Promise((resolve, reject) => {
    if (!key) {
      reject(new Error(
        'Google Maps API キーが未設定です。' +
        '.env.local に NEXT_PUBLIC_GOOGLE_MAPS_API_KEY を設定してください。'
      ));
      return;
    }

    // 既存の <script> があれば再利用（HMR や複数マウント対策）
    const existing = document.getElementById('google-maps-js');
    const cbName = '__initGoogleMapsCallback';

    window[cbName] = () => {
      if (window.google && window.google.maps) resolve(window.google);
      else reject(new Error('Google Maps failed to initialize'));
    };

    if (existing) {
      // 読み込み中のスクリプトが既にある場合はコールバック待ち
      if (window.google && window.google.maps) resolve(window.google);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.async = true;
    script.defer = true;
    // language=ja / region=JP で日本語・日本向け表示。places は住所入力補助用に確保。
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(key)}` +
      '&libraries=places' +
      '&language=ja&region=JP' +
      '&loading=async' +
      `&callback=${cbName}`;
    script.onerror = () =>
      reject(new Error('Google Maps スクリプトの読み込みに失敗しました（キー/課金/ネットワークを確認）'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * 住所 → 座標（forward geocode）。日本国内に限定。
 * @param {string} address
 * @returns {Promise<{lat:number, lng:number, formatted:string} | null>}
 */
export async function geocodeAddress(address) {
  if (!address) return null;
  try {
    const google = await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const googleHit = await new Promise((resolve) => {
      geocoder.geocode(
        { address, componentRestrictions: { country: 'JP' }, language: 'ja' },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng(), formatted: results[0].formatted_address });
          } else {
            resolve(null);
          }
        },
      );
    });
    if (googleHit) return googleHit;
  } catch {
    // Fall through to the server-side geocoder. This keeps map search usable
    // when the browser Geocoder returns ZERO_RESULTS / REQUEST_DENIED.
  }
  return geocodeAddressViaServer(address);
}

/**
 * 座標 → 住所（reverse geocode）。
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string | null>} formatted_address（見つからなければ null）
 */
export async function reverseGeocode(lat, lng) {
  const google = await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode(
      { location: { lat: Number(lat), lng: Number(lng) }, language: 'ja' },
      (results, status) => {
        if (status === 'OK' && results && results[0]) resolve(results[0].formatted_address);
        else resolve(null);
      },
    );
  });
}

/**
 * 価格ピル型マーカーの SVG アイコン（data URI）を生成。Airbnb 風。
 * 通常は白背景＋薄い枠＋やわらかい影、選択時は黒背景＋白文字で少し大きく。
 * AdvancedMarkerElement は Map ID 必須のため、キーだけで動く従来型 Marker + SVG。
 * @param {typeof google} google
 * @param {string} text 表示文字（例 "¥8,000"）
 * @param {boolean} selected 選択中か
 */
export function priceMarkerIcon(google, text, selected) {
  const label = String(text ?? '');
  const fontSize = selected ? 14 : 13;
  // 概算幅（全角/半角混在を考慮してやや広め）
  const approxCharW = fontSize * 0.68;
  const w = Math.max(48, Math.round(label.length * approxCharW) + 24);
  const h = selected ? 34 : 30;
  const pad = 8; // 影のための余白
  const W = w + pad * 2;
  const H = h + pad * 2;
  const bg = selected ? '#222222' : '#ffffff';
  const fg = selected ? '#ffffff' : '#222222';
  const stroke = selected ? '#222222' : '#e6e6e6';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.28"/>` +
    `</filter></defs>` +
    `<rect x="${pad}" y="${pad}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" ` +
    `fill="${bg}" stroke="${stroke}" stroke-width="1" filter="url(#sh)"/>` +
    `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${fontSize}" ` +
    `font-weight="700" fill="${fg}">${esc(label)}</text>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(W / 2, H / 2),
    labelOrigin: new google.maps.Point(W / 2, H / 2),
  };
}
