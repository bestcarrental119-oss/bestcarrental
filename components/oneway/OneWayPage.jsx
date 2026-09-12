'use client';
import { useEffect, useState } from 'react';
import { Modal, GradBtn, Input } from '../Shared';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import UserMapExplorer from './UserMapExplorer';
import OneWayReservationModal from './ReservationModal';
import LoaderOverlay from '../LoaderOverlay';

function RouteAlertModal({ onClose }) {
  const { state, dispatch } = useApp();
  const { currentUser, theme } = state;
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!from.trim() || !to.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/one-way/route-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id ?? null, email: currentUser?.email ?? null, fromArea: from.trim(), toArea: to.trim() }),
      });
      dispatch({ type: 'TOAST', msg: t('ow_alertDone') });
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose}>
      <div className="p-5">
        <h3 className="mb-1 text-lg font-bold text-white">🔔 {t('ow_alertTitle')}</h3>
        <p className="mb-4 text-xs text-gray-400">{t('ow_routeAlertDesc')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t('ow_alertFrom')} value={from} onChange={setFrom} placeholder="大阪 / Osaka" />
          <Input label={t('ow_alertTo')} value={to} onChange={setTo} placeholder="東京 / Tokyo" />
        </div>
        <GradBtn theme={theme} onClick={submit} disabled={busy || !from.trim() || !to.trim()} className="mt-4 w-full py-3 text-sm font-bold">
          {t('ow_alertSubmit')}
        </GradBtn>
      </div>
    </Modal>
  );
}

export default function OneWayPage() {
  const { t } = useI18n();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reserveTarget, setReserveTarget] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/one-way/listings')
      .then(r => r.json())
      .then(d => setListings(d.listings ?? []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f5f3ff] via-white to-[#f3f0ff] px-4 pb-app-nav pt-appbar-lg">
      <div className="mx-auto max-w-xl">
        {/* ヘッダー */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-purple-700">
              🗺️ {t('ow_pageTitle')}
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>{t('ow_bannerPrice')}</span>
            </h1>
            <p className="mt-1 text-xs text-gray-500">{t('ow_pageSub')}</p>
          </div>
          <button onClick={() => setAlertOpen(true)}
            className="flex-shrink-0 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 active:scale-95">
            🔔 {t('ow_routeAlert')}
          </button>
        </div>

        {loading && (
          <div className="app-loader" aria-hidden="true">
            <LoaderOverlay src="/loading-oneway.jpg" />
          </div>
        )}
        {!loading && (
          <UserMapExplorer listings={listings} onReserve={(listing, search) => setReserveTarget({ listing, search })} />
        )}
      </div>

      {reserveTarget && (
        <OneWayReservationModal
          listing={reserveTarget.listing}
          search={reserveTarget.search}
          onClose={() => setReserveTarget(null)}
          onReserved={() => { setReserveTarget(null); load(); }}
        />
      )}
      {alertOpen && <RouteAlertModal onClose={() => setAlertOpen(false)} />}
    </div>
  );
}
