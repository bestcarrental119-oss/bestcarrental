'use client';
import { useEffect, useState } from 'react';
import { GradBtn } from '../Shared';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import { geocodeAddress } from '../../lib/googleMaps';

/**
 * オーナーの拠点住所を保存・管理する。保存した拠点は Best Match 出品時に選べる。
 */
export default function OwnerLocationsManager({ ownerId, ownerAuthId, theme }) {
  const { dispatch } = useApp();
  const { t } = useI18n();
  const [locations, setLocations] = useState([]);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    const qs = new URLSearchParams();
    if (ownerId) qs.set('ownerId', ownerId);
    if (ownerAuthId) qs.set('ownerAuthId', ownerAuthId);
    fetch(`/api/owner/locations?${qs.toString()}`)
      .then(r => r.json()).then(d => setLocations(d.locations ?? [])).catch(() => {});
  };
  useEffect(() => { if (ownerId || ownerAuthId) load(); /* eslint-disable-next-line */ }, [ownerId, ownerAuthId]);

  const add = async () => {
    if (!address.trim()) return;
    setBusy(true);
    try {
      let coords = null;
      try { const g = await geocodeAddress(address.trim()); if (g) coords = { lat: g.lat, lng: g.lng }; } catch {}
      const res = await fetch('/api/owner/locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, ownerAuthId, label: label.trim() || null, address: address.trim(), lat: coords?.lat ?? null, lng: coords?.lng ?? null }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLabel(''); setAddress('');
      dispatch({ type: 'TOAST', msg: t('ow_locSaved') });
      load();
    } catch (e) {
      dispatch({ type: 'TOAST', msg: e.message });
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    await fetch(`/api/owner/locations?id=${id}`, { method: 'DELETE' }).catch(() => {});
    dispatch({ type: 'TOAST', msg: t('ow_locDeleted') });
    load();
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <h4 className="text-white font-bold text-sm">🏠 {t('ow_locTitle')}</h4>
      <p className="mt-1 mb-4 text-xs text-gray-400">{t('ow_locHint')}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t('ow_locLabelField')}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white" />
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder={t('ow_locAddressField')}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white" />
        <GradBtn theme={theme} onClick={add} disabled={busy || !address.trim()} className="px-4 py-2 text-sm font-bold">
          {busy ? '…' : `＋ ${t('ow_locAdd')}`}
        </GradBtn>
      </div>

      <div className="mt-4 space-y-2">
        {locations.length === 0
          ? <p className="text-xs text-gray-500">{t('ow_locNone')}</p>
          : locations.map(loc => (
            <div key={loc.id} className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/40 px-3 py-2">
              <span className="text-lg">📍</span>
              <div className="min-w-0 flex-1">
                {loc.label && <p className="text-sm font-semibold text-white">{loc.label}</p>}
                <p className="truncate text-xs text-gray-400">{loc.address}{loc.lat == null && ' ⚠️'}</p>
              </div>
              <button onClick={() => remove(loc.id)} className="flex-shrink-0 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-red-500 hover:text-red-400">
                ✕
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
