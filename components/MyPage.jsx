'use client';
import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { useCurrency } from '../lib/currency';
import { GradBtn, StatusBadge, Select } from './Shared';
import { calcCancelFee, COUNTRIES, countryLabel } from '../lib/data';
import { supabase } from '../lib/supabase';
import CountryPhoneInput from './CountryPhoneInput';
import ChatModal from './ChatModal';
import ReviewModal from './ReviewModal';
import JapanDrivePassCard from './JapanDrivePassCard';
import EmergencySupportHub from './EmergencySupportHub';
import PickupPass from './PickupPass';
import { useFavorites, toggleFavorite } from '../lib/favorites';
import { BOOKING_TYPES, classLabel } from '../lib/runOfFleet';

const cancellableStatuses = new Set(['confirmed', 'pending', 'pending_assignment', 'payment_pending']);
const reviewableStatuses = new Set(['waiting_review', 'completed', 'confirmed']);
const pickupPassStatuses = new Set(['payment_pending', 'pending', 'confirmed', 'paid', 'pending_assignment', 'in_progress']);
const pickupPassPaymentStatuses = new Set(['paid', 'scheduled', 'authorized']);

const MY_PAGE_JA_FALLBACKS = {
  mp_ownerReviewsTitle: 'オーナーからの評価',
};

function myPageText(t, key) {
  const value = t(key);
  return value === key ? (MY_PAGE_JA_FALLBACKS[key] ?? value) : value;
}

function reservationVehicleId(reservation) {
  return reservation?.vehicleId ?? reservation?.vehicle_id ?? null;
}

function classBasedReservationLabel(reservation, t) {
  return `${classLabel(reservation?.targetClass ?? reservation?.target_class ?? 'standard')} ${t('mp_omakaseReservation')}`;
}

function canOpenPickupPass(reservation) {
  const status = String(reservation?.status ?? '').toLowerCase();
  const paymentStatus = String(reservation?.paymentStatus ?? reservation?.payment_status ?? '').toLowerCase();
  return pickupPassStatuses.has(status) || pickupPassPaymentStatuses.has(paymentStatus);
}

export default function MyPage() {
  const { state, dispatch } = useApp();
  const { currency, format } = useCurrency();
  const { t, locale } = useI18n();
  const { currentUser, vehicles, reservations, theme } = state;
  const [tab, setTab] = useState(state.mypageTab ?? 'reservations');
  const [chatTarget, setChatTarget] = useState(null); // { id, ownerId, maker, model, img }

  // ボトムナビ → MyPage サブタブへの遷移を反映（予約/お気に入り/メッセージ）。
  useEffect(() => {
    if (state.mypageTab && state.mypageTab !== tab) setTab(state.mypageTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mypageTab]);

  // 表示中のタブをグローバルへ反映（ボトムナビのアクティブ表示を正確にするため）。
  useEffect(() => {
    if (state.mypageTab !== tab) dispatch({ type: 'SET_MYPAGE_TAB', v: tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // トースト「タップで開く」やナビから受信箱を開けるようにする
  useEffect(() => {
    window.__openInbox = () => setTab('messages');
    return () => { delete window.__openInbox; };
  }, []);

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState(null); // { reservation, vehicle }

  // Per-reservation review status cache: { [resId]: { customerDone, hostDone, revealed } }
  const [reviewStatus, setReviewStatus] = useState({});

  const myRes = (reservations ?? []).filter(r => r.userId === currentUser?.id);

  // ── Fetch review status for each user reservation ──────────────
  useEffect(() => {
    if (!currentUser || myRes.length === 0) return;
    const relevant = myRes.filter(r =>
      ['waiting_review', 'completed', 'confirmed', 'in_progress'].includes(r.status)
    );
    relevant.forEach(async r => {
      try {
        const res = await fetch(`/api/reviews?reservationId=${r.id}`);
        const data = await res.json();
        const roles = (data.reviews ?? []).map(rv => rv.reviewer_role);
        setReviewStatus(prev => ({
          ...prev,
          [r.id]: {
            customerDone: roles.includes('customer'),
            hostDone:     roles.includes('host'),
            revealed:     data.revealed,
            deadline:     data.deadline,
          },
        }));
      } catch (_) { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, reservations.length]);

  // ── Check for pending (unreviewed completed) reservations ──────
  // Reservations that need a customer review and are past return date
  const pendingReviews = myRes.filter(r => {
    if (!reviewableStatuses.has(r.status)) return false;
    if (!r.ret || new Date(r.ret) > new Date()) return false;
    const rs = reviewStatus[r.id];
    if (!rs) return false;
    return !rs.customerDone;
  });
  const hasBlockingReview = pendingReviews.length > 0;
  const primaryReservation = myRes.find(r => ['confirmed', 'in_progress', 'pending'].includes(r.status)) ?? myRes[0];
  const primaryVehicle = vehicles.find(v => v.id === reservationVehicleId(primaryReservation)) ?? {};

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: theme.pageBg }}>
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-white text-2xl font-bold mb-2">Sign in required</h2>
          <p className="text-gray-400 mb-6">Please sign in to view your page.</p>
          <GradBtn theme={theme} className="px-8 py-3 text-sm" onClick={() => dispatch({ type: 'SET_AUTH', open: true, mode: 'login' })}>
            Sign In
          </GradBtn>
        </div>
      </div>
    );
  }

  const [cancelling, setCancelling] = useState(null); // reservation id being cancelled
  const [passRes, setPassRes] = useState(null);        // reservation showing its QR pickup pass

  const cancelRes = async (res) => {
    // Show the policy up front so the customer sees the fee/refund before confirming.
    const paymentState = String(res.paymentStatus ?? res.payment_status ?? 'none').toLowerCase();
    const notCharged = paymentState === 'scheduled' || paymentState === 'none';
    const paid = Number(res.stripePaidAmount ?? res.total ?? 0);
    const chargeBasis = paymentState === 'authorized' || paid <= 0 ? Number(res.total ?? 0) : paid;
    const fee = notCharged ? 0 : calcCancelFee(chargeBasis, res.pickup);
    const refund = paymentState === 'paid' ? Math.max(0, paid - fee) : 0;

    const message = notCharged
      ? t('cancelConfirmFree')
      : t('cancelConfirmPolicy')
          .replace('{fee}', format(fee))
          .replace('{refund}', format(refund));
    if (!confirm(message)) return;

    setCancelling(res.id);
    try {
      // Automatic, policy-based refund handled server-side (/api/cancel).
      const r = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: res.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error(data.error || 'Cancel failed');

      dispatch({
        type: 'UPDATE_RES',
        r: {
          ...res,
          status: 'cancelled',
          paymentStatus: data.paymentStatus ?? (
            data.charged
              ? (data.refundAmount > 0 ? 'refunded' : 'cancel_fee_captured')
              : (data.released ? 'released' : 'none')
          ),
          refundAmount: data.refundAmount ?? refund,
          cancelFee: data.cancelFee ?? fee,
        },
      });

      const refundShown = data.refundAmount != null ? format(data.refundAmount) : format(refund);
      dispatch({
        type: 'TOAST',
        msg: (data.charged && (data.cancelFee ?? fee) > 0 && !(data.refundAmount ?? refund))
          ? t('mp_cancelledWithFee').replace('{fee}', format(data.cancelFee ?? fee))
          : (data.charged && (data.refundAmount ?? refund) > 0)
          ? t('cancelledWithRefund').replace('{refund}', refundShown)
          : t('cancelledFree'),
      });
    } catch (err) {
      dispatch({ type: 'TOAST', msg: t('cancelFailed') || 'Cancellation failed. Please try again.' });
    } finally {
      setCancelling(null);
    }
  };

  const TABS = [
    { id: 'reservations', label: t('myReservations'), icon: '📋' },
    { id: 'favorites',    label: t('myFavorites'),    icon: '❤️' },
    { id: 'messages',     label: t('myMessages'),     icon: '💬' },
    { id: 'documents',    label: t('myDocuments'),    icon: '🪪' },
    { id: 'drive-pass',   label: t('myDrivePass'),    icon: '🎫' },
    { id: 'emergency',    label: t('myEmergency'),    icon: '🆘' },
    { id: 'profile',      label: t('myProfile'),      icon: '👤' },
  ];

  return (
    <div className="min-h-screen pt-appbar-lg px-4 pb-app-nav" style={{ background: theme.pageBg }}>
      <div className="max-w-4xl mx-auto">

        {/* ── Pending review alert banner ─────────────────────── */}
        {hasBlockingReview && (
          <div className="bg-amber-900/30 border border-amber-600/50 rounded-2xl p-4 mb-5 flex items-start gap-3">
            <span className="text-amber-400 text-2xl flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-amber-300 font-semibold text-sm">{t('mp_unreviewedTitle')}</p>
              <p className="text-amber-400/80 text-xs mt-0.5">
                {t('mp_unreviewedCount').replace('{n}', pendingReviews.length)}
                {' '}{t('mp_unreviewedNote')}
              </p>
            </div>
            <button
              onClick={() => setTab('reservations')}
              className="text-amber-300 text-xs border border-amber-600 rounded-lg px-3 py-1.5 hover:bg-amber-900/40 flex-shrink-0"
            >
              {t('mp_reviewAction')}
            </button>
          </div>
        )}

        {/* Profile header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 flex items-center gap-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
          >
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-white text-xl font-bold">{currentUser.name}</h1>
              {currentUser.isMaster && (
                <span className="bg-amber-900/40 text-amber-300 text-xs px-2 py-0.5 rounded-full font-semibold">★ Master</span>
              )}
              {currentUser.role === 'admin' && !currentUser.isMaster && (
                <span className="bg-purple-900/40 text-purple-300 text-xs px-2 py-0.5 rounded-full font-semibold">Admin</span>
              )}
              {(currentUser.role === 'admin' || currentUser.isMaster) && (
                <button
                  onClick={() => {
                    if (currentUser.isMaster) dispatch({ type: 'SET_ADMIN_TAB', v: 'master' });
                    dispatch({ type: 'SET_MODE', v: 'admin' });
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2.5 py-0.5 rounded-full font-semibold transition-colors"
                >
                  {currentUser.isMaster ? '★ Master Panel' : 'Admin Panel'}
                </button>
              )}
            </div>
            <p className="text-gray-400 text-sm">{currentUser.email}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Total spent</p>
            <p className="text-white font-bold text-lg">¥{currentUser.spent?.toLocaleString()}</p>
            {currency !== 'JPY' && <p className="text-purple-300 text-xs">≈ {format(currentUser.spent ?? 0)} {currency}</p>}
          </div>
        </div>

        {/* Tabs — sticky, swipeable, clean pills */}
        <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-gray-800/60 bg-[var(--tab-bg,rgba(10,10,15,0.85))] px-4 py-2 backdrop-blur-md" style={{ background: (theme.headerBg ?? '#0a0a0f') + 'e6' }}>
          <div className="tab-grid">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold leading-tight transition-all active:scale-95 ${
                  tab === t.id ? 'text-white shadow-md' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
                style={tab === t.id ? { background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` } : {}}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="text-center">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reservations tab */}
        {tab === 'reservations' && (
          <div className="space-y-4">
            {myRes.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-400">No reservations yet.</p>
              </div>
            ) : myRes.map(r => {
              const bookingType = r.bookingType ?? r.booking_type;
              const isClassBased = bookingType === BOOKING_TYPES.CLASS_BASED;
              const v = vehicles.find(veh => String(veh.id) === String(reservationVehicleId(r)));
              const reservationLabel = v
                ? `${v.maker} ${v.model}`
                : isClassBased
                  ? classBasedReservationLabel(r, t)
                  : 'Vehicle';
              const rs = reviewStatus[r.id];
              const isReturned = r.ret && new Date(r.ret) < new Date();
              const canReview  = isReturned && rs && !rs.customerDone &&
                                 reviewableStatuses.has(r.status);
              const canGetPickupPass = canOpenPickupPass(r);

              return (
                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-4">
                      {v?.img && (
                        <img src={v.img} alt={v?.model} className="w-20 h-16 object-contain bg-gray-100 rounded-xl flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 break-words text-white font-semibold">{reservationLabel}</p>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="break-all text-gray-400 text-xs">{r.id}</p>
                        <p className="text-gray-300 text-sm mt-1">
                          {r.pickup?.replace('T', ' ')} → {r.ret?.replace('T', ' ')}
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">{r.days} day{r.days > 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-shrink-0 sm:items-end sm:text-right">
                      <p className="text-white font-bold text-lg sm:text-right">¥{r.total.toLocaleString()}</p>
                      {currency !== 'JPY' && <p className="text-purple-300 text-xs">≈ {format(r.total)} {currency}</p>}

                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-col sm:items-end">
                        {/* 予約確認・受取QR — 予約作成直後（payment_pending 等）から表示 */}
                        {canGetPickupPass && (
                          <button
                            onClick={() => setPassRes(r)}
                            className="min-h-9 w-full rounded-lg border border-purple-700 px-3 py-1 text-center text-xs text-purple-300 transition-colors hover:text-white sm:w-auto"
                          >
                            📱 {t('pp_button')}
                          </button>
                        )}

                        {/* 電子契約書 */}
                        <a
                          href={`/api/contract?reservationId=${encodeURIComponent(r.id)}&locale=${locale}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-9 w-full rounded-lg border border-purple-700 px-3 py-1 text-center text-xs text-purple-300 transition-colors hover:text-white sm:w-auto"
                        >
                          📄 {t('sc_contract')}
                        </a>

                        {/* Cancel button */}
                        {cancellableStatuses.has(r.status) && (
                          <button
                            onClick={() => cancelRes(r)}
                            disabled={cancelling === r.id}
                            className="min-h-9 w-full rounded-lg border border-red-800 px-3 py-1 text-center text-xs text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                          >
                            {cancelling === r.id ? '…' : t('cancel')}
                          </button>
                        )}

                        {/* Review button */}
                        {canReview && (
                          <button
                            onClick={() => setReviewTarget({ reservation: r, vehicle: v })}
                            className="min-h-9 w-full rounded-lg px-3 py-1.5 text-center text-xs font-semibold text-white transition-all hover:opacity-90 sm:w-auto"
                            style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }}
                          >
                            {t('mp_writeReviewStar')}
                          </button>
                        )}
                      </div>

                      {/* Review submitted badge */}
                      {rs?.customerDone && (
                        <div className="flex flex-wrap items-center gap-1 text-left sm:justify-end sm:text-right">
                          <span className="text-green-400 text-xs">{t('mp_reviewed')}</span>
                          {rs.revealed
                            ? <span className="text-gray-500 text-xs">{t('mp_reviewPublic')}</span>
                            : <span className="text-gray-500 text-xs">{t('mp_reviewWaiting')}</span>
                          }
                        </div>
                      )}

                      {/* Deadline countdown */}
                      {rs?.deadline && !rs?.customerDone && (
                        <DeadlineCountdown deadline={rs.deadline} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Favorites & recently viewed — one-tap rebook */}
        {tab === 'favorites' && (
          <FavoritesTab vehicles={vehicles} theme={theme} dispatch={dispatch} currentUser={currentUser} t={t} format={format} />
        )}

        {/* Messages tab — 会話一覧（受信箱）*/}
        {tab === 'messages' && (
          <MessagesTab currentUser={currentUser} theme={theme} onOpen={(c) => setChatTarget(c)} />
        )}

        {/* Documents tab — IDP / Driver License / Passport */}
        {tab === 'documents' && <DocumentsTab currentUser={currentUser} theme={theme} dispatch={dispatch} />}

        {/* Japan Drive Pass tab */}
        {tab === 'drive-pass' && (
          <div className="space-y-4">
            <JapanDrivePassCard
              profile={currentUser}
              pass={{
                status: currentUser.drivePassStatus ?? 'pending',
                tier: currentUser.loyaltyTier ?? 'Bronze',
                fastPickup: currentUser.fastPickup ?? false,
                trips: myRes.length,
                language: currentUser.preferredLanguage ?? 'English',
              }}
            />
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white font-bold text-sm mb-2">Fast Pickup Pre-screening</h3>
              <p className="text-gray-400 text-sm">
                {t('mp_docPreapproveNote')}
              </p>
            </div>
          </div>
        )}

        {/* Emergency tab */}
        {tab === 'emergency' && (
          <EmergencySupportHub
            reservation={primaryReservation}
            vehicle={primaryVehicle}
            insurance={primaryReservation?.insuranceLabel ?? 'Basic coverage included'}
            onChat={() => dispatch({ type: 'TOAST', msg: t('mp_openChatFromDetail') })}
          />
        )}

        {/* Profile tab */}
        {tab === 'profile' && <ProfileTab currentUser={currentUser} theme={theme} dispatch={dispatch} />}
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <ReviewModal
          reservation={reviewTarget.reservation}
          vehicle={reviewTarget.vehicle}
          currentUser={currentUser}
          theme={theme}
          revieweeId={reviewTarget.reservation.ownerId ?? reviewTarget.reservation.owner_id ?? reviewTarget.vehicle?.ownerId ?? reviewTarget.vehicle?.owner_id ?? null}
          onClose={() => setReviewTarget(null)}
          onSubmit={() => {
            // Mark locally as done
            setReviewStatus(prev => ({
              ...prev,
              [reviewTarget.reservation.id]: {
                ...(prev[reviewTarget.reservation.id] ?? {}),
                customerDone: true,
              },
            }));
            setReviewTarget(null);
          }}
        />
      )}

      {/* Chat Modal — 受信箱から会話を開く */}
      {chatTarget && (
        <ChatModal
          open={!!chatTarget}
          onClose={() => setChatTarget(null)}
          vehicle={chatTarget}
          currentUser={currentUser}
          targetLang={locale}
        />
      )}

      {passRes && (
        <PickupPass
          reservation={passRes}
          currentUser={currentUser}
          onClose={() => setPassRes(null)}
        />
      )}
    </div>
  );
}

// ── Favorites & recently viewed — one-tap rebook ─────────────────────
function FavoritesTab({ vehicles, theme, dispatch, currentUser, t, format }) {
  const { fav, recent } = useFavorites();
  const byId = (id) => (vehicles ?? []).find(v => String(v.id) === String(id));
  const favCars = fav.map(byId).filter(Boolean);
  const recentCars = recent.map(byId).filter(Boolean).filter(v => !fav.includes(String(v.id)));

  const book = (v) => {
    const profile = currentUser?.bookingProfile ?? {};
    dispatch({
      type: 'SET_BOOKING',
      b: {
        vehicleId: v.id, vehicle: v, bookingType: 'specific', step: 1, type: v.type,
        pickup: '', ret: '', opts: {},
        info: {
          name: currentUser?.name ?? '', email: currentUser?.email ?? '',
          phone: currentUser?.phone || profile.phone || '', nat: profile.nat ?? currentUser?.nat ?? '',
        },
      },
    });
  };

  const Row = ({ v }) => (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-3">
      <img src={v.img || v.img_url || 'https://via.placeholder.com/96x72?text=Car'} alt={v.model}
           className="h-16 w-24 flex-shrink-0 rounded-xl bg-gray-100 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{v.maker} {v.model}</p>
        <p className="text-xs text-gray-400">{(v.loc ?? '').split(',')[0]}</p>
        <p className="text-sm font-bold text-purple-300">{format(v.priceDay ?? v.price_day ?? 0)}<span className="text-[11px] text-gray-500">/{t('perDay')}</span></p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <button onClick={() => toggleFavorite(v.id)} className="text-lg text-rose-500 active:scale-90" aria-label="Remove">♥</button>
        <button onClick={() => book(v)} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white active:scale-95">
          {t('favBook')}
        </button>
      </div>
    </div>
  );

  if (favCars.length === 0 && recentCars.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
        <div className="text-4xl mb-3">❤️</div>
        <p className="text-gray-400 text-sm">{t('favEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {favCars.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-white">❤️ {t('favSaved')} ({favCars.length})</p>
          <div className="space-y-2">{favCars.map(v => <Row key={v.id} v={v} />)}</div>
        </div>
      )}
      {recentCars.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-white">🕘 {t('favRecent')}</p>
          <div className="space-y-2">{recentCars.slice(0, 8).map(v => <Row key={v.id} v={v} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Messages tab: 会話一覧（受信箱）────────────────────────────────
function MessagesTab({ currentUser, theme, onOpen }) {
  const { t } = useI18n();
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!currentUser?.id) return;
    setLoading(true);
    fetch(`/api/chat?userId=${currentUser.id}&role=user`)
      .then(r => r.json())
      .then(data => setConvs(Array.isArray(data) ? data : []))
      .catch(() => setConvs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentUser?.id]);

  if (loading) return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-400">{t('mp_loading')}</div>;

  if (convs.length === 0) return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
      <div className="text-4xl mb-3">💬</div>
      <p className="text-gray-400">{t('mp_noMessages')}</p>
      <p className="text-gray-500 text-sm mt-1">{t('mp_noMessagesHint')}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {convs.map(c => {
        const v = c.vehicle ?? {};
        const msgs = Array.isArray(c.messages) ? c.messages : [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const unread = msgs.filter(m => !m.is_read && m.sender_role !== 'user').length;
        return (
          <button
            key={c.id}
            onClick={() => onOpen({ id: v.id ?? c.vehicle_id, ownerId: c.owner_user_id, maker: v.maker, model: v.model, img: v.img_url })}
            className="w-full text-left bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4 hover:border-purple-600 transition-colors"
          >
            {v.img_url
              ? <img src={v.img_url} alt="" className="w-16 h-12 object-cover rounded-lg flex-shrink-0 bg-gray-800" />
              : <div className="w-16 h-12 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">🚗</div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-semibold truncate">{v.maker ? `${v.maker} ${v.model}` : t('mp_chat')}</p>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0">{unread}</span>
                )}
              </div>
              <p className="text-gray-400 text-sm truncate">{last ? last.content : t('mp_openMessage')}</p>
            </div>
            <span className="text-gray-500 flex-shrink-0">›</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Documents tab: IDP / Driver License / Passport 管理 ───────────────
const MAX_DOC_BYTES = 3 * 1024 * 1024;
const DOC_TYPES = [
  { key: 'license',  labelKey: 'mp_docLicense', icon: '🚗' },
  { key: 'idp',      labelKey: 'mp_docIdp', icon: '🌐' },
  { key: 'passport', labelKey: 'mp_docPassport', icon: '🛂' },
];

function readDocFile(file, t) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) return reject(new Error(t('mp_errFileType')));
    if (file.size > MAX_DOC_BYTES) return reject(new Error(t('mp_errFileSize')));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = () => reject(new Error(t('mp_errFileRead')));
    reader.readAsDataURL(file);
  });
}

function DocumentsTab({ currentUser, theme, dispatch }) {
  const { t } = useI18n();
  const profile = currentUser.bookingProfile ?? {};
  const [docs, setDocs] = useState(() => ({ ...(profile.documents ?? {}) }));
  const [nat, setNat] = useState(currentUser.nat ?? profile.nat ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const setDoc = (key, patch) => setDocs(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }));

  const onFile = async (key, file) => {
    setErr('');
    try {
      const saved = await readDocFile(file, t);
      if (saved) setDoc(key, { fileName: saved.name, dataUrl: saved.dataUrl });
    } catch (e) { setErr(e.message); }
  };

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const nextProfile = { ...profile, nat, documents: docs, updatedAt: new Date().toISOString() };
      const { error } = await supabase.auth.updateUser({ data: { nat, bookingProfile: nextProfile } });
      if (error) throw error;
      dispatch({ type: 'UPDATE_CURRENT_USER', patch: { nat, bookingProfile: nextProfile } });
      setMsg(t('mp_saved'));
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setErr(e.message || t('mp_errSaveSignin'));
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-white font-bold mb-1">{t('mp_docTitle')}</h3>
        <p className="text-gray-400 text-sm">{t('mp_docSubtitle')}</p>
      </div>

      {/* Nationality */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">{t('mp_nationality')}</label>
        <select value={nat} onChange={e => setNat(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
          <option value="">{t('mp_selectPlaceholder')}</option>
          {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.ja} / {c.en}</option>)}
        </select>
      </div>

      {DOC_TYPES.map(dt => {
        const d = docs[dt.key] ?? {};
        return (
          <div key={dt.key} className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
            <p className="text-white text-sm font-semibold mb-2">{dt.icon} {t(dt.labelKey)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('mp_expiry')}</label>
                <input type="date" value={d.expiry ?? ''} onChange={e => setDoc(dt.key, { expiry: e.target.value })}
                  style={{ colorScheme: 'dark' }}
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('mp_upload')}</label>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => onFile(dt.key, e.target.files?.[0])}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {d.fileName && <p className="text-xs text-violet-300 mt-2">✓ {d.fileName}</p>}
          </div>
        );
      })}

      {err && <p className="text-red-400 text-sm">❌ {err}</p>}
      <div className="flex items-center gap-3">
        <GradBtn theme={theme} onClick={save} disabled={saving} className="px-6 py-2.5 text-sm">
          {saving ? t('mp_saving') : t('mp_save')}
        </GradBtn>
        {msg && <span className="text-green-400 text-sm">✓ {msg}</span>}
      </div>
    </div>
  );
}

// ── Deadline countdown chip ────────────────────────────────────────
function DeadlineCountdown({ deadline }) {
  const { t } = useI18n();
  const d   = new Date(deadline);
  const now = new Date();
  const diff = d - now;
  if (diff <= 0) return <span className="text-red-400 text-xs">{t('mp_expired')}</span>;

  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const daysStr = days > 0 ? `${days}${t('bm_daysUnit')} ` : '';

  return (
    <span className="text-amber-400 text-xs">
      ⏳ {t('mp_autoCompleteIn').replace('{d}', daysStr).replace('{h}', hours)}
    </span>
  );
}

// ── Email change with verification code ────────────────────────────────────
// Sends a 6-digit code to the NEW address; on success the change is applied
// server-side (Supabase admin) and the local session is refreshed.
function ChangeEmailSection({ currentUser, theme, dispatch }) {
  const { locale, t } = useI18n();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [open, setOpen]       = useState(false);
  const [stage, setStage]     = useState('input'); // 'input' | 'verify'
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [info, setInfo]       = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const tmr = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(tmr);
  }, [resendIn]);

  const reset = () => { setOpen(false); setStage('input'); setNewEmail(''); setCode(''); setErr(''); setInfo(''); };

  const sendCode = async () => {
    setErr(''); setInfo('');
    if (!EMAIL_RE.test(newEmail)) { setErr(t('am_errEmailFormat')); return; }
    if (newEmail.trim().toLowerCase() === (currentUser.email || '').toLowerCase()) { setErr(t('mp_errSameEmail')); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', purpose: 'change_email', email: newEmail, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'email_in_use') setErr(t('am_errEmailInUse'));
        else if (data.error === 'too_soon') setErr(t('am_errTooSoon').replace('{n}', data.retryAfter));
        else if (data.error === 'email_not_configured') setErr(t('am_errEmailNotConfigured'));
        else setErr(t('am_errSendCodeFailed'));
        return;
      }
      setStage('verify'); setResendIn(60);
      setInfo(t('am_codeSent').replace('{email}', newEmail));
      if (data.devCode) setInfo(t('am_devCode').replace('{code}', data.devCode));
    } catch { setErr(t('am_errNetwork')); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    setErr('');
    if (!/^\d{6}$/.test(code)) { setErr(t('am_errOtpFormat')); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', purpose: 'change_email', email: newEmail, code, userId: currentUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'mismatch') setErr(t('am_errOtpMismatch').replace('{n}', data.remaining ?? ''));
        else if (data.error === 'expired') setErr(t('am_errOtpExpired'));
        else if (data.error === 'too_many') setErr(t('am_errOtpTooMany'));
        else setErr(t('am_errVerifyFailed'));
        return;
      }
      // Sync the local session to the new email.
      try { await supabase.auth.refreshSession(); } catch {}
      dispatch({ type: 'UPDATE_CURRENT_USER', patch: { email: newEmail } });
      dispatch({ type: 'TOAST', msg: t('mp_emailChanged') });
      reset();
    } catch { setErr(t('am_errNetwork')); }
    finally { setLoading(false); }
  };

  return (
    <div className="border-t border-gray-800 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-bold">{t('mp_emailLabel')}</p>
          <p className="text-gray-400 text-xs mt-0.5 break-all">{currentUser.email}</p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="text-sm font-medium" style={{ color: theme.accent }}>{t('mp_change')}</button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 bg-gray-800/40 border border-gray-700 rounded-xl p-4">
          {stage === 'input' ? (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('mp_newEmail')}</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com"
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                <p className="text-gray-500 text-xs mt-1">{t('mp_newEmailNote')}</p>
              </div>
              {info && <p className="text-green-400 text-sm">{info}</p>}
              {err && <p className="text-red-400 text-sm">{err}</p>}
              <div className="flex items-center gap-3">
                <GradBtn theme={theme} onClick={sendCode} disabled={loading} className="px-5 py-2 text-sm">
                  {loading ? t('am_sending') : t('mp_sendCode')}
                </GradBtn>
                <button onClick={reset} className="text-sm text-gray-400 hover:text-white">{t('mp_cancel')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-300 text-xs">{info || t('am_verifySubDefault').replace('{email}', newEmail)}</p>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="______"
                className="w-full text-center tracking-[0.5em] font-mono text-xl bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" />
              {err && <p className="text-red-400 text-sm">{err}</p>}
              <div className="flex items-center justify-between">
                <GradBtn theme={theme} onClick={verify} disabled={loading} className="px-5 py-2 text-sm">
                  {loading ? t('am_verifying') : t('mp_verifyChange')}
                </GradBtn>
                <button onClick={sendCode} disabled={resendIn > 0 || loading}
                  className="text-sm font-semibold disabled:opacity-40" style={{ color: theme.primary }}>
                  {resendIn > 0 ? t('am_resendCountdown').replace('{n}', resendIn) : t('mp_resend')}
                </button>
              </div>
              <button onClick={reset} className="text-sm text-gray-400 hover:text-white">{t('mp_cancel')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile tab: editable name / phone (国番号) / nationality + saved cards ──
function ProfileTab({ currentUser, theme, dispatch }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(currentUser.name ?? '');
  const [phone, setPhone] = useState(currentUser.phone ?? currentUser.bookingProfile?.phone ?? '');
  const [nat, setNat]     = useState(currentUser.nat ?? currentUser.bookingProfile?.nat ?? '');
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState([]);
  const [reviewProfile, setReviewProfile] = useState(null);

  const countryOptions = COUNTRIES.map(c => ({
    value: c.code,
    label: `${c.flag} ${locale?.startsWith('zh') ? c.zh : (c[locale] ?? c.en)}`,
  }));

  useEffect(() => {
    if (!currentUser?.id) return;
    fetch(`/api/cards?userId=${currentUser.id}`).then(r => r.json()).then(d => setCards(d.cards ?? [])).catch(() => {});
    fetch(`/api/reviews?userId=${currentUser.id}`).then(r => r.json()).then(d => setReviewProfile(d?.error ? null : d)).catch(() => setReviewProfile(null));
  }, [currentUser?.id]);

  const save = async () => {
    setSaving(true);
    try {
      const nextProfile = { ...(currentUser.bookingProfile ?? {}), phone, nat, updatedAt: new Date().toISOString() };
      await supabase.auth.updateUser({ data: { name, phone, nat, bookingProfile: nextProfile } }).catch(() => {});
      dispatch({ type: 'UPDATE_CURRENT_USER', patch: { name, phone, nat, bookingProfile: nextProfile } });
      dispatch({ type: 'TOAST', msg: t('profileSaved') });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const removeCard = async (cardId) => {
    const res = await fetch(`/api/cards?userId=${currentUser.id}&cardId=${cardId}`, { method: 'DELETE' });
    const d = await res.json();
    setCards(d.cards ?? []);
  };

  const Row = ({ label, value }) => (
    <div className="flex justify-between border-b border-gray-800 pb-3">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value || '—'}</span>
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">{t('profile') || t('mp_profile')}</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm font-medium" style={{ color: theme.accent }}>
            ✎ {t('editProfile')}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-sm text-gray-400 hover:text-white">{t('cancel')}</button>
            <GradBtn theme={theme} className="px-4 py-1.5 text-sm" onClick={save} disabled={saving}>{t('save')}</GradBtn>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3">
          <Row label={t('fullName')} value={currentUser.name} />
          <Row label={t('email')} value={currentUser.email} />
          <Row label={t('phone')} value={phone} />
          <Row label={t('nationality')} value={nat ? countryLabel(nat, locale) : '—'} />
          <Row label="Role" value={currentUser.role} />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('fullName')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <CountryPhoneInput label={t('phone')} value={phone} onChange={setPhone} />
          <Select label={t('nationality')} value={nat} onChange={setNat}
            options={[{ value: '', label: '— ' + t('selectCountry') + ' —' }, ...countryOptions]} />
          <p className="text-xs text-gray-500">{t('mp_emailChangeHint')}</p>
        </div>
      )}

      <ChangeEmailSection currentUser={currentUser} theme={theme} dispatch={dispatch} />

      <div className="border-t border-gray-800 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white text-sm font-bold">{myPageText(t, 'mp_ownerReviewsTitle')}</p>
            <p className="text-gray-500 text-xs mt-0.5">{t('mp_ownerReviewsSub')}</p>
          </div>
          <div className="text-right">
            <p className="text-amber-400 text-lg font-black">
              {reviewProfile?.avgRating != null ? `★ ${Number(reviewProfile.avgRating).toFixed(1)}` : '—'}
            </p>
            <p className="text-gray-500 text-xs">{t('mp_reviewCountPts').replace('{n}', reviewProfile?.reviewCount ?? 0).replace('{pts}', reviewProfile?.ratingPoints ?? '—')}</p>
          </div>
        </div>
        {(reviewProfile?.visibleReviews ?? []).length > 0 && (
          <div className="mt-3 space-y-2">
            {reviewProfile.visibleReviews.slice(0, 3).map(review => (
              <div key={review.id} className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-amber-400 text-xs font-bold">★ {review.rating}</span>
                  <span className="text-gray-600 text-[11px]">{review.createdAt?.slice(0, 10)}</span>
                </div>
                {review.comment && <p className="text-gray-300 text-xs mt-1 line-clamp-2">{review.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-2">{t('savedCards')}</p>
          <div className="space-y-2">
            {cards.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-3 py-2">
                <span>💳</span>
                <span className="text-sm text-white capitalize">{c.brand}</span>
                <span className="text-sm text-gray-300 font-mono">•••• {c.last4}</span>
                <button onClick={() => removeCard(c.id)} className="ml-auto text-xs text-red-400 hover:text-red-300">{t('removeCard')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => dispatch({ type: 'LOGOUT' })} className="mt-2 text-red-400 hover:text-red-300 text-sm font-medium">
        {t('signOut') || 'Sign out'}
      </button>
    </div>
  );
}
