'use client';
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../lib/i18nContext';
import { grad } from './Shared';
import ReviewModal from './ReviewModal';

function Card({ children, className = '' }) {
  return <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 ${className}`}>{children}</div>;
}

function Stars({ value }) {
  if (value == null) return <span className="text-gray-600 text-xs">—</span>;
  return <span className="text-amber-400 text-sm font-semibold">★ {Number(value).toFixed(1)}</span>;
}

/**
 * Owner ↔ Renter reviews & block management.
 * Props: owner, reservations (owner's), vehicles, currentUser, theme
 */
export default function OwnerRenterReviews({ owner, reservations = [], vehicles = [], currentUser, theme }) {
  const { t } = useI18n();
  const g = grad(theme);

  const [statusMap, setStatusMap] = useState({});   // reservationId -> {hostDone}
  const [given, setGiven]         = useState([]);
  const [renterStats, setRenterStats] = useState({});
  const [blocks, setBlocks]       = useState([]);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [toast, setToast]         = useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  // Reservations whose rental has ended → candidates for reviewing the renter
  const now = Date.now();
  const candidates = (reservations ?? []).filter(r => {
    const ret = r.return_at ? new Date(r.return_at).getTime() : null;
    const ended = ret && ret < now;
    return ended && r.user_id && ['confirmed', 'in_progress', 'waiting_review', 'completed'].includes(r.status);
  });

  const loadReviewStatus = useCallback(async () => {
    const entries = await Promise.all(candidates.map(async r => {
      try {
        const res = await fetch(`/api/reviews?reservationId=${r.id}`);
        const data = await res.json();
        const roles = (data.reviews ?? []).map(rv => rv.reviewer_role);
        return [r.id, { hostDone: roles.includes('host') }];
      } catch { return [r.id, { hostDone: false }]; }
    }));
    setStatusMap(Object.fromEntries(entries));
  }, [candidates.map(c => c.id).join(',')]);

  const loadRenterData = useCallback(async () => {
    if (!owner?.id) return;
    try {
      const [rrRes, blkRes] = await Promise.all([
        fetch(`/api/owner/renter-reviews?ownerId=${owner.id}`).then(r => r.json()),
        fetch(`/api/owner/blocks?ownerId=${owner.id}`).then(r => r.json()),
      ]);
      setGiven(rrRes.given ?? []);
      setRenterStats(rrRes.renterStats ?? {});
      setBlocks(Array.isArray(blkRes) ? blkRes : []);
    } catch { /* demo mode */ }
  }, [owner?.id]);

  useEffect(() => { loadReviewStatus(); }, [loadReviewStatus]);
  useEffect(() => { loadRenterData(); }, [loadRenterData]);

  const isBlocked = (userId) => blocks.some(b => b.user_id === userId);

  const blockRenter = async (userId, name) => {
    if (!window.confirm(t('rr_blockConfirm'))) return;
    const reason = window.prompt(t('rr_blockReasonPh')) ?? '';
    try {
      await fetch('/api/owner/blocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: owner.id, userId, reason }),
      });
      showToast(`${name || t('rr_renter')} — ${t('rr_blocked')}`);
      loadRenterData();
    } catch { showToast('Error'); }
  };

  const unblockRenter = async (userId) => {
    try {
      await fetch('/api/owner/blocks', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: owner.id, userId }),
      });
      loadRenterData();
    } catch { showToast('Error'); }
  };

  const pending = candidates.filter(r => !statusMap[r.id]?.hostDone);
  // Unique renters seen by this owner (from reservations)
  const renterIds = [...new Set(candidates.map(r => r.user_id).filter(Boolean))];

  const renterName = (userId) => renterStats[userId]?.name || t('rr_renter');

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg border border-gray-700">
          {toast}
        </div>
      )}

      <p className="text-gray-400 text-sm">{t('rr_intro')}</p>

      {/* ── 評価待ちの利用者 ── */}
      <div>
        <h3 className="text-white font-bold mb-3">{t('rr_pendingTitle')}</h3>
        {pending.length === 0 ? (
          <Card className="text-center py-8"><p className="text-gray-500 text-sm">{t('rr_noPending')}</p></Card>
        ) : (
          <div className="space-y-3">
            {pending.map(r => {
              const veh = vehicles.find(v => v.id === r.vehicle_id);
              return (
                <Card key={r.id} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{renterName(r.user_id)}</p>
                    <p className="text-gray-500 text-xs">{r.id} · {veh ? `${veh.maker} ${veh.model}` : r.vehicle_id}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{r.pickup_at?.slice(0, 10)} → {r.return_at?.slice(0, 10)}</p>
                  </div>
                  <button
                    onClick={() => setReviewTarget(r)}
                    className="px-4 py-2 rounded-xl text-sm text-white font-semibold flex-shrink-0"
                    style={{ background: g }}>
                    {t('rr_reviewRenter')} ★
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 利用者の評価一覧 + ブロック ── */}
      <div>
        <h3 className="text-white font-bold mb-3">{t('rr_renterRatingTitle')}</h3>
        {renterIds.length === 0 ? (
          <Card className="text-center py-8"><p className="text-gray-500 text-sm">{t('rr_noRenterReviews')}</p></Card>
        ) : (
          <div className="space-y-2">
            {renterIds.map(uid => {
              const st = renterStats[uid] || {};
              const low = st.avg != null && st.avg < 3;
              const blocked = isBlocked(uid);
              return (
                <Card key={uid} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{st.name || t('rr_renter')}</p>
                    <p className="text-gray-500 text-xs flex items-center gap-2">
                      <Stars value={st.avg} />
                      <span>({st.count ?? 0} {t('rr_reviewsCount')})</span>
                      {low && <span className="text-red-400">{t('rr_lowRatingWarn')}</span>}
                    </p>
                  </div>
                  {blocked ? (
                    <button onClick={() => unblockRenter(uid)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-green-700 text-green-400 hover:border-green-500 flex-shrink-0">
                      {t('rr_unblock')}
                    </button>
                  ) : (
                    <button onClick={() => blockRenter(uid, st.name)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-red-700/50 text-red-400 hover:border-red-500 flex-shrink-0">
                      {t('rr_block')}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ブロック中の利用者 ── */}
      <div>
        <h3 className="text-white font-bold mb-3">{t('rr_blockedTitle')}</h3>
        {blocks.length === 0 ? (
          <Card className="text-center py-8"><p className="text-gray-500 text-sm">{t('rr_noBlocked')}</p></Card>
        ) : (
          <div className="space-y-2">
            {blocks.map(b => (
              <Card key={b.id} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{b.users?.name || t('rr_renter')}</p>
                  {b.reason && <p className="text-gray-500 text-xs">{b.reason}</p>}
                </div>
                <button onClick={() => unblockRenter(b.user_id)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-green-700 text-green-400 hover:border-green-500 flex-shrink-0">
                  {t('rr_unblock')}
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── レビューモーダル（オーナー→利用者）── */}
      {reviewTarget && (
        <ReviewModal
          reservation={reviewTarget}
          vehicle={vehicles.find(v => v.id === reviewTarget.vehicle_id)}
          currentUser={currentUser}
          theme={theme}
          role="host"
          revieweeId={reviewTarget.user_id}
          title={t('rr_reviewRenterTitle')}
          subtitle={renterName(reviewTarget.user_id)}
          onClose={() => setReviewTarget(null)}
          onSubmit={() => {
            setStatusMap(prev => ({ ...prev, [reviewTarget.id]: { hostDone: true } }));
            setReviewTarget(null);
            loadRenterData();
          }}
        />
      )}
    </div>
  );
}
