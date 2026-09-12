'use client';
import { useMemo, useRef, useState } from 'react';
import { Modal, GradBtn, grad } from '../Shared';
import StripeForm from '../StripeForm';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import { offeredPlans } from '../../lib/insurance';
import { calcAuthorization, ONE_WAY_DEPOSIT } from '../../lib/oneWay';

const yen = n => `¥${Number(n || 0).toLocaleString()}`;

// 厳格ルールの同意チェック
function Consent({ checked, onToggle, label }) {
  return (
    <button type="button" onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        checked ? 'border-emerald-500 bg-emerald-900/15' : 'border-gray-700 bg-gray-800/40'}`}>
      <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
        checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-500 text-transparent'}`}>✓</span>
      <span className="text-xs leading-relaxed text-gray-200">{label}</span>
    </button>
  );
}

export default function OneWayReservationModal({ listing, onClose, onReserved }) {
  const { state, dispatch } = useApp();
  const { currentUser, theme } = state;
  const { t } = useI18n();
  const g = grad(theme);

  const stripeRef = useRef(null);
  const cardElRef = useRef(null);
  const [planId, setPlanId] = useState('basic');
  const [consent, setConsent] = useState({ fuel: false, clean: false, noChange: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const plans = useMemo(() => (listing ? offeredPlans(listing) : []), [listing]);
  const days = useMemo(() => {
    const dl = listing?.deadlineAt ? new Date(listing.deadlineAt).getTime() : 0;
    if (!dl) return 1;
    return Math.max(1, Math.ceil((dl - Date.now()) / (1000 * 3600 * 24)));
  }, [listing]);

  const plan = plans.find(p => p.id === planId) ?? plans[0];
  const insuranceAmount = (plan?.price ?? 0) * days;
  const auth = calcAuthorization({ base: listing?.basePrice ?? 0, insurance: insuranceAmount, deposit: ONE_WAY_DEPOSIT });
  const allConsented = consent.fuel && consent.clean && consent.noChange;

  if (!listing) return null;

  const finalize = async (reservationId) => {
    await fetch('/api/reservations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reservationId, status: 'confirmed', paymentStatus: 'authorized' }),
    }).catch(() => {});
    await fetch('/api/one-way/listings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: listing.id, status: 'reserved', reservedBy: currentUser?.id ?? null, reservationId }),
    }).catch(() => {});
    dispatch({ type: 'TOAST', msg: t('ow_reservedTitle') });
    onReserved?.(reservationId);
  };

  const handleReserve = async () => {
    setError('');
    if (!allConsented) { setError(t('ow_mustAgree')); return; }
    if (!currentUser?.id) {
      setError(t('authRequiredBooking'));
      dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/one-way/reserve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          userId: currentUser.id,
          email: currentUser.email ?? '',
          insurancePlanId: plan?.id ?? 'basic',
          insuranceAmount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.demo) {
        await finalize(data.reservationId);
        setDone(data);
        return;
      }

      const stripe = stripeRef.current;
      const card = cardElRef.current;
      if (!stripe || !card) throw new Error(t('paymentFormNotReady') || 'Payment form not ready');

      // Pre-authorization（仮売上）を確定：capture_method 'manual' なので与信確保のみ。
      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card, billing_details: { name: currentUser.name ?? '', email: currentUser.email ?? '' } },
      });
      if (result.error) throw new Error(result.error.message);
      const st = result.paymentIntent?.status;
      if (st !== 'requires_capture' && st !== 'succeeded') throw new Error('Authorization failed');

      await finalize(data.reservationId);
      setDone(data);
    } catch (e) {
      setError(e.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        {done ? (
          /* ── 完了：与信確保（「決済完了」とは絶対に言わない） ── */
          <div className="py-6 text-center">
            <div className="mb-3 text-5xl">🔐</div>
            <h3 className="mb-2 text-xl font-bold text-white">{t('ow_reservedTitle')}</h3>
            <p className="mx-auto mb-4 max-w-sm text-sm leading-relaxed text-gray-300">{t('ow_reservedBody')}</p>
            <div className="mx-auto mb-5 max-w-xs rounded-xl bg-gray-800 p-4 text-left text-sm">
              <div className="flex justify-between py-1"><span className="text-gray-400">{t('ow_holdTotal')}</span>
                <span className="font-mono font-bold text-white">{yen(done.holdTotal)}</span></div>
              <div className="flex justify-between py-1"><span className="text-gray-400">{t('ow_authDeposit')}</span>
                <span className="font-mono text-gray-300">{yen(done.depositAmount)}</span></div>
            </div>
            <button onClick={onClose} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: g }}>OK</button>
          </div>
        ) : (
          <>
            <button
              onClick={onClose}
              className="mb-3 -ml-1 flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-semibold text-gray-300 hover:text-white active:scale-95"
            >
              ← {t('bk_back')}
            </button>
            <h3 className="mb-1 text-lg font-bold text-white">🗺️ {t('ow_resTitle')}</h3>
            <p className="mb-4 text-xs text-gray-400">
              {listing.from?.name} → {listing.to?.name} · {listing.distanceKm}km
            </p>

            {/* 車両 */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/40 p-3">
              {listing.img
                ? <img src={listing.img} alt="" className="h-14 w-20 flex-shrink-0 rounded-lg object-cover" />
                : <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-gray-700 text-2xl">🚗</span>}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{listing.maker} {listing.model}</p>
                <p className="text-xs text-gray-400">
                  {t('ow_baseFee')}: <span className="font-bold text-white">{listing.basePrice > 0 ? yen(listing.basePrice) : t('ow_free')}</span>
                </p>
              </div>
            </div>

            {/* 補償プラン */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-gray-300">🛡 {t('ow_insurance')}</p>
              <div className="flex flex-wrap gap-2">
                {plans.map(p => {
                  const on = p.id === planId;
                  const price = p.price === 0 ? t('ins_free') : `¥${(p.price * days).toLocaleString()}`;
                  return (
                    <button key={p.id} type="button" onClick={() => setPlanId(p.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition-all ${on ? 'border-transparent' : 'border-gray-700 bg-gray-800/40'}`}
                      style={on ? { boxShadow: `0 0 0 2px ${p.accent}`, background: 'rgba(255,255,255,0.04)' } : {}}>
                      <span className="block font-bold text-white">{t(`ins_${p.id}_name`)}</span>
                      <span className="font-mono" style={{ color: p.accent }}>{price}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 同意（厳格ルール） */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-gray-300">{t('ow_consentTitle')}</p>
              <div className="space-y-2">
                <Consent checked={consent.fuel} onToggle={() => setConsent(c => ({ ...c, fuel: !c.fuel }))} label={t('ow_consentFuel')} />
                <Consent checked={consent.clean} onToggle={() => setConsent(c => ({ ...c, clean: !c.clean }))} label={t('ow_consentClean')} />
                <Consent checked={consent.noChange} onToggle={() => setConsent(c => ({ ...c, noChange: !c.noChange }))} label={t('ow_consentNoChange')} />
              </div>
            </div>

            {/* オーソリ内訳 */}
            <div className="mb-4 rounded-xl bg-gray-800 p-4">
              <p className="mb-2 text-xs font-semibold text-gray-300">{t('ow_authTitle')}</p>
              {[
                { label: t('ow_authBase'), amt: auth.base, show: true },
                { label: `${t('ow_authInsurance')} (${days}d)`, amt: auth.insurance, show: auth.insurance > 0 },
                { label: t('ow_authDeposit'), amt: auth.deposit, show: true, muted: true },
              ].filter(r => r.show).map(r => (
                <div key={r.label} className="flex justify-between py-1 text-sm">
                  <span className={r.muted ? 'text-amber-300/80' : 'text-gray-300'}>{r.label}</span>
                  <span className="font-mono text-white">{yen(r.amt)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-gray-700 pt-2 text-base font-bold">
                <span className="text-white">{t('ow_holdTotal')}</span>
                <span className="font-mono" style={{ color: theme?.accent ?? '#a855f7' }}>{yen(auth.holdTotal)}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-emerald-300/80">💡 {t('ow_captureNote')}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-300/70">🔒 {t('ow_depositWhy')}</p>
            </div>

            {/* カード（与信確保のみ・引き落としではない） */}
            <div className="mb-3">
              <StripeForm
                primaryColor={theme?.primary ?? '#7c3aed'}
                amount={0}
                onReady={(stripe, card) => { stripeRef.current = stripe; cardElRef.current = card; }}
              />
            </div>

            <p className="mb-3 text-center text-[11px] text-gray-500">ℹ️ {t('ow_notCharged')}</p>

            {error && (
              <div className="mb-3 rounded-xl border border-red-700/40 bg-red-900/30 p-3 text-sm text-red-300">❌ {error}</div>
            )}

            <GradBtn theme={theme} onClick={handleReserve} disabled={busy || !allConsented}
              className="w-full py-3.5 text-base font-bold">
              {busy ? t('ow_reserveProcessing') : `🔐 ${t('ow_reserveCta')}`}
            </GradBtn>
          </>
        )}
      </div>
    </Modal>
  );
}
