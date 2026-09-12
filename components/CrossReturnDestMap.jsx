'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Shared';
import { loadGoogleMaps, hasGoogleMapsKey, priceMarkerIcon } from '../lib/googleMaps';

const yen = n => `¥${Number(n || 0).toLocaleString()}`;

// 受け入れ先の料金を短いラベルに（ピン表示用）
export function feeLabel(rc, t) {
  if (rc.feeMode === 'storage') return `${yen(rc.storagePerDay)}/${t('cr_perDay')}`;
  if (rc.splitType === 'fixed') return yen(rc.splitValue);
  return `${rc.splitValue}%`;
}

/**
 * 受け入れ先を地図で選ぶ（Airbnb風の料金ピン）。
 * receivers: [{ownerId, storeName, location, lat, lng, feeMode, ...}]
 * selectedIds: string[] / onToggle(ownerId) / onClose
 */
export default function CrossReturnDestMap({ vehicleName, receivers = [], selectedIds = [], onToggle, onClose, t }) {
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!hasGoogleMapsKey());
  const sel = new Set(selectedIds.map(String));
  const withCoords = receivers.filter(r => r.lat != null && r.lng != null);

  useEffect(() => {
    if (failed || !mapDiv.current) return;
    let alive = true;
    loadGoogleMaps().then(google => {
      if (!alive) return;
      mapRef.current = new google.maps.Map(mapDiv.current, {
        center: withCoords[0] ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : { lat: 36.2, lng: 137.9 },
        zoom: withCoords.length ? 7 : 5, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
      });
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // ピン描画（選択状態が変わるたびに更新）
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google) return;
    const google = window.google;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    withCoords.forEach(rc => {
      const selected = sel.has(String(rc.ownerId));
      const marker = new google.maps.Marker({
        position: { lat: rc.lat, lng: rc.lng }, map: mapRef.current,
        icon: priceMarkerIcon(google, feeLabel(rc, t), selected),
        title: rc.storeName, zIndex: selected ? 999 : 1,
      });
      marker.addListener('click', () => onToggle?.(rc.ownerId));
      markersRef.current.push(marker);
      bounds.extend({ lat: rc.lat, lng: rc.lng });
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedIds, receivers]);

  return (
    <Modal open onClose={onClose} wide>
      <div className="p-4 sm:p-5">
        <h3 className="text-lg font-bold text-white">🗺 {t('cr_pickOnMap')}</h3>
        <p className="mt-1 mb-3 text-xs text-gray-400">{vehicleName} · {t('cr_pickOnMapHint')}</p>

        {failed ? (
          <div className="space-y-2">
            <p className="rounded-xl bg-amber-900/20 p-3 text-xs text-amber-300">⚠️ {t('ow_mapUnavailable')}</p>
            {receivers.map(rc => (
              <button key={rc.ownerId} onClick={() => onToggle?.(rc.ownerId)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${sel.has(String(rc.ownerId)) ? 'border-purple-500 bg-purple-900/20 text-purple-100' : 'border-gray-700 text-gray-300'}`}>
                <span className="min-w-0 truncate">{sel.has(String(rc.ownerId)) ? '✓ ' : ''}{rc.storeName}{rc.location ? ` · ${rc.location}` : ''}</span>
                <span className="ml-2 flex-shrink-0 font-bold text-white">{feeLabel(rc, t)}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div ref={mapDiv} className="h-[56vh] w-full overflow-hidden rounded-2xl border border-purple-300/50" />
            <p className="mt-2 text-center text-[11px] text-gray-400">👆 {t('cr_tapPinToggle')}</p>
          </>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white active:scale-95">
          {t('cr_done')} ({sel.size})
        </button>
      </div>
    </Modal>
  );
}
