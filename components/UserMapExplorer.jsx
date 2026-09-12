'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18nContext';
import { loadGoogleMaps, hasGoogleMapsKey } from '../../lib/googleMaps';
import { pinStatus, PIN_COLORS } from '../../lib/oneWay';

const yen = n => `¥${Number(n || 0).toLocaleString()}`;
const fmtDate = s => { try { return new Date(s).toLocaleString(); } catch { return s; } };

// 明るくクリーンな自然マップ：やわらかな緑（陸）＋澄んだブルー（海）。装飾は最小限。
const CYBER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#e4f5db' }] },              // 陸（明るく穏やかな緑）
  { elementType: 'labels.text.fill', stylers: [{ color: '#2f5a4a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#c2ddca' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#10b981' }] }, // 国境＝エメラルド
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#b3d6c1' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#0f766e' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#dcefcf' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#cceabb' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#f2faee' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#8fd9c9' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#34b89b' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfe6f2' }] },          // 海（澄んだブルー）
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3178ac' }] },
];

// 埋め込みCSS：装飾は最小限（うっすら緯線経線とボトムシートのみ）
const CYBER_CSS = `
@keyframes owSheet { from{transform:translateY(100%)} to{transform:translateY(0)} }
.ow-grid{position:absolute;inset:0;pointer-events:none;opacity:.035;
  background-image:linear-gradient(rgba(16,185,129,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,.5) 1px,transparent 1px);
  background-size:56px 56px}
.ow-sheet{animation:owSheet .28s cubic-bezier(.16,1,.3,1)}
`;

function DetailSheet({ listing, t, onReserve, onClose }) {
  if (!listing) return null;
  const status = pinStatus(listing);
  return (
    <div className="ow-sheet pointer-events-auto absolute inset-x-0 bottom-0 z-20">
      <div className="mx-auto max-w-xl rounded-t-3xl border-t border-emerald-200 bg-white/95 p-4 shadow-[0_-8px_40px_rgba(16,185,129,0.2)] backdrop-blur">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex gap-3">
          {listing.img
            ? <img src={listing.img} alt="" className="h-16 w-24 flex-shrink-0 rounded-xl object-cover ring-1 ring-emerald-200" />
            : <span className="flex h-16 w-24 items-center justify-center rounded-xl bg-gray-100 text-2xl">🚗</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: PIN_COLORS[status] }}>
                {status === 'now' ? t('ow_availableNow') : t('ow_upcoming')}
              </span>
              <span className="text-sm font-bold text-gray-900">{listing.maker} {listing.model}</span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-600">
              {listing.from?.name} <span className="text-emerald-600">→</span> {listing.to?.name} · {listing.distanceKm}km
            </p>
            <p className="text-xs text-gray-500">
              {t('ow_baseFee')}: <span className="font-bold text-gray-900">{listing.basePrice > 0 ? yen(listing.basePrice) : t('ow_free')}</span>
              {listing.deadlineAt && <> · {t('ow_deadline')}: {fmtDate(listing.deadlineAt)}</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="close" className="h-7 w-7 flex-shrink-0 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">✕</button>
        </div>
        <button onClick={() => onReserve(listing)}
          className="mt-3 w-full rounded-xl py-3 text-sm font-black tracking-wide text-white shadow-[0_6px_20px_rgba(5,150,105,0.45)]"
          style={{ background: 'linear-gradient(135deg,#10b981,#0891b2)' }}>
          {t('ow_viewDetail')} →
        </button>
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

export default function UserMapExplorer({ listings = [], onReserve }) {
  const { t } = useI18n();
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const glowRef = useRef(null);   // 下地のネオン太線
  const arcRef = useRef(null);    // 本線
  const carRef = useRef(null);    // ルートを走る車
  const arcTimer = useRef(null);
  const travelTimer = useRef(null);
  const colorTimer = useRef(null);
  const pulseTimer = useRef(null);
  const [selected, setSelected] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(!hasGoogleMapsKey());

  const clearArc = () => {
    [arcTimer, travelTimer, colorTimer].forEach(r => { if (r.current) { clearInterval(r.current); r.current = null; } });
    [glowRef, arcRef, carRef].forEach(r => { if (r.current) { r.current.setMap(null); r.current = null; } });
  };

  const drawArc = (google, listing) => {
    clearArc();
    if (!listing.from?.lat || !listing.to?.lat) return;
    const pts = arcPoints(listing.from, listing.to);

    // 下地グロー（控えめなエメラルド）
    glowRef.current = new google.maps.Polyline({
      path: [], geodesic: false, strokeColor: '#34d399', strokeOpacity: 0.28, strokeWeight: 9, map: mapRef.current,
    });
    // 本線（クリーンなエメラルド）＋ 先端の矢印
    arcRef.current = new google.maps.Polyline({
      path: [], geodesic: false, strokeColor: '#059669', strokeOpacity: 1, strokeWeight: 3.5,
      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.5, strokeColor: '#047857', fillColor: '#059669', fillOpacity: 1 }, offset: '100%' }],
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
          fillColor: '#059669', fillOpacity: 1,
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

  const select = (listing, google) => {
    setSelected(listing);
    if (google && mapRef.current) drawArc(google, listing);
  };

  // 地図初期化
  useEffect(() => {
    if (mapFailed || !mapDiv.current) return;
    let alive = true;
    loadGoogleMaps()
      .then(google => {
        if (!alive) return;
        mapRef.current = new google.maps.Map(mapDiv.current, {
          center: { lat: 36.2, lng: 137.9 }, zoom: 5,
          disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
          backgroundColor: '#e4f5db', styles: CYBER_MAP_STYLE,
        });
        setMapReady(true);
      })
      .catch(() => { if (alive) setMapFailed(true); });
    return () => { alive = false; clearArc(); if (pulseTimer.current) clearInterval(pulseTimer.current); };
  }, [mapFailed]);

  // ピン配置＋パルスアニメーション
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google) return;
    const google = window.google;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (pulseTimer.current) { clearInterval(pulseTimer.current); pulseTimer.current = null; }

    const bounds = new google.maps.LatLngBounds();
    listings.forEach(listing => {
      if (!listing.from?.lat) return;
      const status = pinStatus(listing);
      const color = PIN_COLORS[status];
      const marker = new google.maps.Marker({
        position: { lat: listing.from.lat, lng: listing.from.lng },
        map: mapRef.current,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.2 },
        title: `${listing.maker} ${listing.model}`,
      });
      marker.__baseScale = 8;
      marker.__color = color;
      marker.addListener('click', () => select(listing, google));
      markersRef.current.push(marker);
      bounds.extend(listing.from);
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 60);

    // ネオンの脈動（scale と strokeWeight を正弦波で揺らす）
    pulseTimer.current = setInterval(() => {
      const now = performance.now();
      markersRef.current.forEach((m, idx) => {
        const s = 7.5 + (Math.sin(now / 520 + idx) + 1) * 0.85;
        m.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: s, fillColor: m.__color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.2 });
      });
    }, 55);
  }, [mapReady, listings]);

  // ── フォールバック（APIキー無し）：リスト表示 ──
  if (mapFailed) {
    return (
      <div>
        <p className="mb-3 rounded-xl bg-amber-900/20 p-3 text-xs text-amber-300">⚠️ {t('ow_mapUnavailable')}</p>
        {listings.length === 0
          ? <p className="py-8 text-center text-sm text-gray-400">{t('ow_noListings')}</p>
          : (
            <div className="space-y-3">
              {listings.map(listing => {
                const status = pinStatus(listing);
                return (
                  <button key={listing.id} onClick={() => onReserve(listing)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-cyan-400/20 bg-gray-800/40 p-3 text-left active:scale-[0.99] hover:border-cyan-400/50">
                    {listing.img
                      ? <img src={listing.img} alt="" className="h-14 w-20 flex-shrink-0 rounded-lg object-cover" />
                      : <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-gray-700 text-2xl">🚗</span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: PIN_COLORS[status] }}>
                          {status === 'now' ? t('ow_availableNow') : t('ow_upcoming')}
                        </span>
                        <span className="truncate text-sm font-bold text-white">{listing.maker} {listing.model}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-300">{listing.from?.name} → {listing.to?.name} · {listing.distanceKm}km</p>
                      <p className="text-xs text-gray-400">{t('ow_baseFee')}: <span className="font-bold text-white">{listing.basePrice > 0 ? yen(listing.basePrice) : t('ow_free')}</span></p>
                    </div>
                    <span className="text-cyan-400">›</span>
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
    <div className="relative h-[62vh] w-full overflow-hidden rounded-2xl border border-emerald-300/50 shadow-[0_8px_30px_rgba(16,185,129,0.15)]">
      <style>{CYBER_CSS}</style>
      <div ref={mapDiv} className="h-full w-full" />
      {/* うっすら緯線経線のみ */}
      <div className="ow-grid" />
      {!selected && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full border border-emerald-300/60 bg-white/85 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm backdrop-blur-sm">👆 {t('ow_tapPin')}</span>
        </div>
      )}
      <DetailSheet listing={selected} t={t} onReserve={onReserve} onClose={() => setSelected(null)} />
    </div>
  );
}
