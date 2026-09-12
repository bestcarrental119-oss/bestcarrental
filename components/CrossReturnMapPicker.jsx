'use client';
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, hasGoogleMapsKey, geocodeAddress, reverseGeocode, focusMapOnCoordinates } from '../lib/googleMaps';

/**
 * 受け入れ拠点を地図で直感的に指定するピッカー。
 * - 住所を入力して検索 → ピン設置＋座標セット
 * - 地図をタップ → その地点にピン＋座標セット（住所も自動補完）
 * value: { location, lat, lng } / onChange で同形を返す。
 * APIキーが無ければ住所＋緯度経度の手入力にフォールバック。
 */
export default function CrossReturnMapPicker({ value, onChange, t }) {
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!hasGoogleMapsKey());
  const [addr, setAddr] = useState(value?.location ?? '');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const emit = (patch) => onChange?.({ location: addr, lat: value?.lat ?? null, lng: value?.lng ?? null, ...patch });

  const placePin = (google, lat, lng, recenter = false) => {
    if (!mapRef.current) return;
    const pos = { lat, lng };
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        map: mapRef.current, position: pos, draggable: true,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#7c3aed', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
      });
      markerRef.current.addListener('dragend', async (e) => {
        const la = e.latLng.lat(), ln = e.latLng.lng();
        const a = await reverseGeocode(la, ln).catch(() => null);
        if (a) setAddr(a);
        onChange?.({ location: a ?? addr, lat: la, lng: ln });
      });
    } else {
      markerRef.current.setPosition(pos);
    }
    if (recenter) focusMapOnCoordinates({ google, map: mapRef.current, position: pos });
    else mapRef.current.panTo(pos);
  };

  useEffect(() => {
    if (failed || !mapDiv.current) return;
    let alive = true;
    loadGoogleMaps().then(google => {
      if (!alive) return;
      const center = (value?.lat != null && value?.lng != null) ? { lat: value.lat, lng: value.lng } : { lat: 35.68, lng: 139.76 };
      mapRef.current = new google.maps.Map(mapDiv.current, {
        center, zoom: value?.lat != null ? 13 : 5, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
      });
      if (value?.lat != null && value?.lng != null) placePin(google, value.lat, value.lng);
      mapRef.current.addListener('click', async (e) => {
        const la = e.latLng.lat(), ln = e.latLng.lng();
        placePin(google, la, ln);
        const a = await reverseGeocode(la, ln).catch(() => null);
        if (a) setAddr(a);
        onChange?.({ location: a ?? addr, lat: la, lng: ln });
      });
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    if (!ready || !mapRef.current || value?.lat == null || value?.lng == null) return;
    const google = typeof window !== 'undefined' ? window.google : null;
    if (google) placePin(google, Number(value.lat), Number(value.lng), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, value?.lat, value?.lng]);

  const search = async () => {
    if (!addr.trim()) return;
    setSearching(true);
    setSearchErr('');
    try {
      const g = await geocodeAddress(addr.trim());
      if (g) {
        onChange?.({ location: g.formatted || addr, lat: g.lat, lng: g.lng });
        setAddr(g.formatted || addr);
        const google = (typeof window !== 'undefined' && window.google) ? window.google : await loadGoogleMaps().catch(() => null);
        if (google && mapRef.current) placePin(google, g.lat, g.lng, true);
      } else {
        setSearchErr(t('cr_searchNotFound'));
      }
    } catch {
      setSearchErr(t('cr_searchFailed'));
    } finally { setSearching(false); }
  };

  const inp = 'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none';

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input value={addr} onChange={e => { setAddr(e.target.value); emit({ location: e.target.value }); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder={t('cr_locationPh')} className={inp} />
        {!failed && (
          <button type="button" onClick={search} disabled={searching}
            className="flex-shrink-0 rounded-lg border border-purple-600 px-3 py-2 text-xs font-bold text-purple-200 active:scale-95 disabled:opacity-50">
            {searching ? '…' : `🔍 ${t('cr_search')}`}
          </button>
        )}
      </div>
      {searchErr && <p className="mb-2 text-xs text-red-400">{searchErr}</p>}

      {failed ? (
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="0.000001" value={value?.lat ?? ''} onChange={e => onChange?.({ location: addr, lat: e.target.value, lng: value?.lng ?? null })} placeholder="lat" className={inp} />
          <input type="number" step="0.000001" value={value?.lng ?? ''} onChange={e => onChange?.({ location: addr, lat: value?.lat ?? null, lng: e.target.value })} placeholder="lng" className={inp} />
        </div>
      ) : (
        <>
          <div ref={mapDiv} className="h-52 w-full overflow-hidden rounded-xl border border-purple-300/50" />
          <p className="mt-1 text-[11px] text-gray-500">{t('cr_mapPickHint')}</p>
        </>
      )}
      {value?.lat != null && value?.lng != null && (
        <p className="mt-1 text-[11px] text-emerald-300">📍 {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)}</p>
      )}
    </div>
  );
}
