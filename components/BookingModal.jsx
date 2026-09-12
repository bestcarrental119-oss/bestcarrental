'use client';
import AvailabilityCalendar from './AvailabilityCalendar';
import { useRef, useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { Modal, GradBtn, Input, Select, grad } from './Shared';
import StripeForm from './StripeForm';
import DamageConsent from './DamageConsent';
import SignaturePad from './SignaturePad';
import BookingDrivePassUpsell from './BookingDrivePassUpsell';
import { BOOKING_TYPES, buildReservationPayload, classLabel } from '../lib/runOfFleet';
import { COUNTRIES } from '../lib/data';
import { offeredPlans, INSURANCE_ITEMS, INSURANCE_EXCLUSION_KEYS } from '../lib/insurance';
import { useI18n } from '../lib/i18nContext';
import { useCurrency } from '../lib/currency';
import CountryPhoneInput from './CountryPhoneInput';
import { supabase } from '../lib/supabase';
import { computeCrossReturnCustomerFee } from '../lib/crossReturn';

export const BOOKING_GUIDES = [
  { name: 'Masami', image: '/characters/masami.jpeg', titleKey: 'bookingGuideMasamiTitle', bodyKey: 'bookingGuideMasamiBody' },
  { name: 'Rina', image: '/characters/rina.png', titleKey: 'bookingGuideRinaTitle', bodyKey: 'bookingGuideRinaBody' },
  { name: 'Risa', image: '/characters/risa.png', titleKey: 'bookingGuideRisaTitle', bodyKey: 'bookingGuideRisaBody' },
];

function makeGuestBookingToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeReservationId() {
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const suffix = raw.replace(/-/g, '').slice(0, 10).toUpperCase();
  return `BCR-${new Date().getFullYear()}-${suffix}`;
}

const SNS_CHANNELS = ['LINE', 'WhatsApp', 'WeChat', 'Messenger'];
const MAX_IDP_FILE_BYTES = 2 * 1024 * 1024;

function readBookingIdpFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      reject(new Error('IDP file must be JPG, PNG, WebP, or PDF.'));
      return;
    }
    if (file.size > MAX_IDP_FILE_BYTES) {
      reject(new Error('IDP file is too large. Please upload a file under 2MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = () => reject(new Error('Could not read IDP file.'));
    reader.readAsDataURL(file);
  });
}

async function saveReservationBeforePayment(payload) {
  const res = await fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Failed to save reservation');
  if (Array.isArray(json)) return json.find(r => String(r.id) === String(payload.id)) ?? payload;
  return json ?? payload;
}

async function finalizeReservationAfterPayment(payload) {
  const res = await fetch('/api/reservations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Failed to finalize reservation');
  return json ?? payload;
}

// datetime-local の値が「日付＋時刻」両方入力済みか確認
function isDtComplete(val) {
  return Boolean(val && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val));
}

function formatBookingDateTime(value, locale) {
  if (!isDtComplete(value)) return value || '-';
  try {
    return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// 公開レビュー（これから借りる人が参考にする、利用者→車/加盟店の評価）
function PublicReviews({ vehicleId, t }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!vehicleId) return undefined;
    let alive = true;
    fetch(`/api/reviews/public?vehicleId=${vehicleId}`)
      .then(r => r.json())
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [vehicleId]);
  if (!data || !data.count) return null;
  return (
    <div className="mt-4 bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-white">{t('pr_reviewsTitle')}</span>
        <span className="text-amber-400 font-bold text-sm">★ {Number(data.avg ?? 0).toFixed(1)}</span>
        <span className="text-gray-400 text-xs">· {data.count} {t('pr_reviewsCount')}</span>
      </div>
      <div className="space-y-2 max-h-44 overflow-y-auto">
        {(data.reviews || []).slice(0, 8).map((r, i) => (
          <div key={i} className="border-b border-gray-700/50 pb-2 last:border-0">
            <div className="text-amber-400 text-xs">{'★'.repeat(Math.max(0, Math.round(r.rating)))}</div>
            {r.comment && <p className="text-gray-300 text-xs mt-0.5 whitespace-pre-line">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 補償プラン選択 — 各プランの自己負担が直感的に分かる比較カード
function InsurancePlanSelector({ plans, value, onChange, t }) {
  const money = (n) => `¥${Number(n).toLocaleString()}`;
  const payColor = (n) => (n === 0 ? '#10b981' : n >= 150000 ? '#ef4444' : '#f59e0b');
  const scenarios = [
    { id: 'other', labelKey: 'ins_scenarioOther' },
    { id: 'self', labelKey: 'ins_scenarioSelf' },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-white font-semibold text-sm">🛡 {t('ins_sectionTitle')}</h4>
        <p className="text-gray-500 text-xs mt-0.5">{t('ins_sectionSub')}</p>
      </div>

      {plans.length <= 1 && (
        <p className="text-gray-400 text-xs">{t('ins_noneAvailable')}</p>
      )}

      {plans.map((p) => {
        const selected = p.id === value;
        const priceLabel = p.price === 0 ? t('ins_free') : `¥${p.price.toLocaleString()} ${t('ins_per24h')}`;
        return (
          <div
            key={p.id}
            className={`rounded-2xl border transition-all ${selected ? 'border-transparent bg-white/5' : 'border-gray-700 bg-gray-800/40'}`}
            style={selected ? { boxShadow: `0 0 0 2px ${p.accent}` } : {}}
          >
            <button
              type="button"
              onClick={() => onChange(p.id)}
              className="w-full flex items-start gap-3 p-4 text-left"
            >
              <span
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: selected ? p.accent : '#6b7280', background: selected ? p.accent : 'transparent' }}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-bold">{t(`ins_${p.id}_name`)}</span>
                    {p.recommended && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: p.accent }}>
                        {t('ins_recommended')}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold" style={{ color: p.accent }}>{priceLabel}</span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{t(`ins_${p.id}_tag`)}</p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {scenarios.map((sc) => (
                    <div key={sc.id} className="rounded-lg bg-black/25 px-2.5 py-2">
                      <p className="text-[10px] text-gray-400 leading-tight">{t(sc.labelKey)}</p>
                      <p className="text-[10px] text-gray-500 mt-1">{t('ins_maxOutOfPocket')}</p>
                      <p className="text-sm font-extrabold" style={{ color: payColor(p.maxPayout[sc.id]) }}>
                        {money(p.maxPayout[sc.id])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </button>

            {selected && (
              <div className="px-4 pb-4">
                <div className="overflow-hidden rounded-lg border border-gray-700">
                  <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-gray-800 text-[10px] text-gray-400">
                    <span className="p-2">{t('ins_detailsShow')}</span>
                    <span className="p-2 text-center">{t('ins_scenarioOther')}</span>
                    <span className="p-2 text-center">{t('ins_scenarioSelf')}</span>
                  </div>
                  {INSURANCE_ITEMS.map((item) => (
                    <div key={item} className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-gray-700 text-[11px]">
                      <span className="p-2 text-gray-300">{t(`ins_item_${item}`)}</span>
                      {scenarios.map((sc) => {
                        const covered = p.coverage[sc.id][item];
                        return (
                          <span
                            key={sc.id}
                            className={`p-2 text-center font-semibold ${covered ? 'text-green-400' : 'text-red-400'}`}
                          >
                            {covered ? `○ ${t('ins_covered')}` : `× ${t('ins_selfPay')}`}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-xl border border-amber-700/30 bg-amber-900/15 p-3">
        <p className="text-amber-300 text-xs font-bold mb-1">⚠️ {t('ins_exclTitle')}</p>
        <ul className="space-y-0.5">
          {INSURANCE_EXCLUSION_KEYS.map((k) => (
            <li key={k} className="text-amber-200/80 text-[11px]">・{t(k)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function BookingModal() {
  const { state, dispatch } = useApp();
  const { booking, currentUser, theme } = state;
  const { t, locale } = useI18n();
  const { currency, format } = useCurrency();
  const countryOptions = COUNTRIES.map(c => ({
    value: c.code,
    label: `${c.flag} ${locale.startsWith('zh') ? c.zh : (c[locale] ?? c.en)}`,
  }));
  const stripeRef = useRef(null);
  const cardElRef = useRef(null);

  // ── すべての hooks を early return より前に ────────────────
  const [paying,        setPaying]        = useState(false);
  const [payError,      setPayError]      = useState('');
  const [dtError,       setDtError]       = useState('');
  const [storeAddons,   setStoreAddons]   = useState([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [oneWayLocations, setOneWayLocations] = useState([]);
  const [oneWayLoading,   setOneWayLoading]   = useState(false);
  // 保存済みクレカ
  const [savedCards,   setSavedCards]   = useState([]);
  const [selectedCard, setSelectedCard] = useState(null); // 保存カードobj、null=新規カード
  const [saveCardOn,   setSaveCardOn]   = useState(true);
  const [classAck,      setClassAck]      = useState(false); // おまかせ：ランダム割当の同意
  const [classAckError, setClassAckError] = useState(false);

  // 予約モーダルを開いたら保存済みカードを読み込む（次回自動入力用）
  useEffect(() => {
    if (!booking || !currentUser?.id) return;
    fetch(`/api/cards?userId=${currentUser.id}`)
      .then(r => r.json())
      .then(d => {
        const cards = d.cards ?? [];
        setSavedCards(cards);
        if (cards.length > 0) setSelectedCard(cards[0]);
      })
      .catch(() => {});
  }, [booking?.vehicleId, currentUser?.id]);

  const step     = booking?.step     ?? 1;
  const vehicleId = booking?.vehicleId;
  const v        = booking?.vehicle ?? state.vehicles?.find(x => x.id === vehicleId) ?? {};
  const ownerId  = v.ownerId ?? v.owner_id ?? null;
  const activeVehicleId = v.id ?? v.vehicleId ?? v.vehicle_id ?? vehicleId ?? null;
  const isClassBased = v?.listingType === BOOKING_TYPES.CLASS_BASED || booking?.bookingType === BOOKING_TYPES.CLASS_BASED;
  const guide = BOOKING_GUIDES[(Math.max(1, step) - 1) % BOOKING_GUIDES.length];

  // Step 3 に進んだとき店舗アドオンを取得
  useEffect(() => {
    if (!booking || step !== 3) return;
    setAddonsLoading(true);
    const url = ownerId ? `/api/addons?ownerId=${ownerId}` : '/api/addons';
    fetch(url)
      .then(r => r.json())
      .then(data => setStoreAddons(Array.isArray(data) ? data : []))
      .catch(() => setStoreAddons([]))
      .finally(() => setAddonsLoading(false));
  }, [step, ownerId, booking]);

  // オーナーが設定した異地返却場所を取得
  useEffect(() => {
    if (!booking || step !== 3 || !ownerId) return;
    setOneWayLoading(true);
    fetch(`/api/one-way-locations?ownerId=${ownerId}&vehicleId=${activeVehicleId}`)
      .then(r => r.json())
      .then(data => setOneWayLocations(Array.isArray(data) ? data : []))
      .catch(() => setOneWayLocations([]))
      .finally(() => setOneWayLoading(false));
  }, [booking, step, activeVehicleId, ownerId]);

  // ── early return（hooks の後）────────────────────────────
  if (!booking) return null;

  const {
    pickup = '', ret = '',
    pickupLoc = '', retLoc = '',
    opts = {}, info = {}, payment = 'card',
    lastReservation = null,
  } = booking;

  const b    = patch => dispatch({ type: 'BOOK_STEP', patch });
  const next = () => b({ step: step + 1 });
  const prev = () => b({ step: step - 1 });
  const steps = [
    t('bookingStepDateTime'),
    t('bookingStepVehicle'),
    t('bookingStepAddons'),
    t('bookingStepPrice'),
    t('bookingStepInfo'),
    t('bookingStepPayment'),
    t('bookingStepConfirm'),
  ];
  const g    = grad(theme);
  const bookingProfile = currentUser?.bookingProfile ?? {};
  const requiredBookingInfo = {
    ...bookingProfile,
    ...info,
    name: info.name ?? currentUser?.name ?? '',
    email: info.email ?? currentUser?.email ?? '',
    phone: info.phone ?? currentUser?.phone ?? bookingProfile.phone ?? '',
    nat: info.nat ?? currentUser?.nat ?? bookingProfile.nat ?? '',
    license: info.license ?? currentUser?.license ?? bookingProfile.license ?? '',
    idpExpiresOn: info.idpExpiresOn ?? bookingProfile.idpExpiresOn ?? '',
    idpFileName: info.idpFileName ?? bookingProfile.idpFileName ?? '',
    idpFileDataUrl: info.idpFileDataUrl ?? bookingProfile.idpFileDataUrl ?? '',
    channels: info.channels ?? bookingProfile.channels ?? [],
    contactHandles: {
      ...(bookingProfile.contactHandles ?? {}),
      ...(info.contactHandles ?? {}),
    },
  };
  const hasContactChannel = SNS_CHANNELS.some(ch => {
    const selected = (requiredBookingInfo.channels ?? []).includes(ch);
    const handle = String(requiredBookingInfo.contactHandles?.[ch] ?? '').trim();
    return selected && handle;
  });
  const hasSavedIdpFile = Boolean(
    requiredBookingInfo.idpFileDataUrl
      || requiredBookingInfo.idpFileName
      || bookingProfile.idpFileName,
  );

  const saveBookingProfile = async () => {
    if (!currentUser?.id) throw new Error('Please sign in before booking.');
    const profile = {
      phone: requiredBookingInfo.phone,
      nat: requiredBookingInfo.nat,
      license: requiredBookingInfo.license,
      idpExpiresOn: requiredBookingInfo.idpExpiresOn,
      idpFileName: requiredBookingInfo.idpFileName,
      idpFileStored: hasSavedIdpFile,
      channels: requiredBookingInfo.channels ?? [],
      contactHandles: requiredBookingInfo.contactHandles ?? {},
      updatedAt: new Date().toISOString(),
    };
    const { error } = await supabase.auth.updateUser({
      data: {
        name: requiredBookingInfo.name,
        phone: requiredBookingInfo.phone,
        nat: requiredBookingInfo.nat,
        license: requiredBookingInfo.license,
        bookingProfile: profile,
      },
    });
    if (error) throw error;
    dispatch({
      type: 'UPDATE_CURRENT_USER',
      patch: {
        name: requiredBookingInfo.name,
        phone: requiredBookingInfo.phone,
        nat: requiredBookingInfo.nat,
        license: requiredBookingInfo.license,
        bookingProfile: profile,
      },
    });
  };

  // ── 日数計算 ─────────────────────────────────────────────
  const days = (() => {
    if (!pickup || !ret) return 1;
    return Math.max(1, Math.ceil((new Date(ret) - new Date(pickup)) / (1000 * 3600 * 24)));
  })();

  // ── 金額計算 ─────────────────────────────────────────────
  const priceDay = Number(v.priceDay ?? v.price_day ?? 0);
  const deposit = Number(v.deposit ?? 0);
  const baseAmt   = priceDay * days;
  // ── 補償プラン ───────────────────────────────────────────
  const insurancePlanOptions = offeredPlans(v);
  const selectedInsuranceId = opts.insurancePlan ?? 'basic';
  const selectedInsurancePlan =
    insurancePlanOptions.find(p => p.id === selectedInsuranceId) ?? insurancePlanOptions[0];
  const insAmt    = (selectedInsurancePlan?.price ?? 0) * days;
  const selectedOneWayLocation = oneWayLocations.find(loc => String(loc.id) === String(opts.onewayLocationId));
  const onewayAmt = opts.oneway
    ? (selectedOneWayLocation ? Number(selectedOneWayLocation.price ?? 0) : (retLoc && v[`airportFee_${retLoc}`] ? Number(v[`airportFee_${retLoc}`]) : 3300))
    : 0;
  const customAmt = storeAddons
    .filter(a => opts[`custom_${a.id}`])
    .reduce((sum, a) => sum + (a.price_type === 'per_day' ? a.price * days : a.price), 0);
  // 跨区域送车（异地调车）— 加盟店送車の場合は送車費を加算（料金は加盟オーナー/管理者が車両に設定）
  const isPartnerVehicle = Boolean(v.deliveryAvailable ?? v.crossRegion ?? v.partnerDelivery);
  const deliveryAmt = isPartnerVehicle ? Number(v.deliveryFee ?? v.delivery_fee ?? 0) : 0;
  // 異地还车（他拠点返却）の追加料金 — 受け入れオーナーが設定した条件で計算
  const cr = opts.crossReturn;
  // 保管料は「元オーナーが設定した想定保管日数」で計算（レンタル日数とは別）
  const crExpectedDays = Math.max(1, Number(cr?.expectedDays) || 1);
  const crossReturnFee = cr
    ? computeCrossReturnCustomerFee({ ...cr, expectedDays: crExpectedDays }, baseAmt)
    : { baseFee: 0, receiverFee: 0, total: 0 };
  const crossReturnAmt = crossReturnFee.total;
  const totalAmt = baseAmt + insAmt + onewayAmt + customAmt + deliveryAmt + crossReturnAmt;

  // ── Step 1 バリデーション ─────────────────────────────────
  const step1Valid = isDtComplete(pickup) && isDtComplete(ret) && new Date(ret) > new Date(pickup);
  const hasPresetDates = Boolean(booking?.datePreset && step1Valid);

  // 現在時刻（datetime-local の min 用、過去日時を選べないように）
  const nowLocalStr = (() => {
    const d = new Date();
    d.setSeconds(0, 0);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  })();
  // 返却の最小値 = 出発の1分後（出発が未設定なら現在）
  const retMinStr = isDtComplete(pickup)
    ? (() => { const d = new Date(pickup); d.setMinutes(d.getMinutes() + 1); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); })()
    : nowLocalStr;
  // 出発変更時に、返却が出発以前なら返却をクリアする
  const handlePickupChange = (val) => {
    if (ret && val && new Date(ret) <= new Date(val)) b({ pickup: val, ret: '' });
    else b({ pickup: val });
    setDtError('');
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!isDtComplete(pickup) || !isDtComplete(ret)) {
        setDtError(t('dateTimeRequired'));
        return;
      }
      if (new Date(ret) <= new Date(pickup)) {
        setDtError(t('returnAfterPickup'));
        return;
      }
      setDtError('');
      // ── 空き確認 ────────────────────────────────────────────
      if (!isClassBased && activeVehicleId && pickup && ret) {
        try {
          const chk = await fetch(
            `/api/reservations/check?vehicleId=${activeVehicleId}&pickup=${encodeURIComponent(pickup)}&ret=${encodeURIComponent(ret)}`
          );
          if (!chk.ok) throw new Error('availability check failed');
          const { available, conflicts } = await chk.json();
          if (!available) {
            const conflictStr = (conflicts ?? [])
              .map(c => `${c.pickup} → ${c.ret}`)
              .join(', ');
            setDtError(`${t('vehicleBooked')}\n${t('bookedPeriods')}: ${conflictStr}`);
            return;
          }
        } catch {
          setDtError(t('availabilityCheckFailed'));
          return;
        }
      }
    }
    if (step === 2 && isClassBased && !classAck) {
      setClassAckError(true);
      return;
    }
    if (step === 5) {
      if (!currentUser?.id) {
        setPayError(t('authRequiredBooking'));
        dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
        return;
      }
      if (!requiredBookingInfo.name || !requiredBookingInfo.email || !requiredBookingInfo.phone) {
        setPayError(t('nameEmailPhoneRequired'));
        return;
      }
      // IDP（国際免許証）のアップロードは任意。未提出でも予約は進められる。
      // 代わりに Step 5 に返金免責の注意書きを表示している。
      if (!hasContactChannel) {
        setPayError('Please select at least one SNS channel and enter its ID/handle.');
        return;
      }
      saveBookingProfile().catch(error => {
        console.warn('[booking profile sync failed]', error);
      });
      setPayError('');
    }
    next();
  };

  const ensureNoPendingReservation = async () => {
    if (!currentUser?.id) return;
    const chk = await fetch(`/api/reservations?userId=${currentUser.id}&checkPending=1`);
    const { pendingCount, hasPending } = await chk.json().catch(() => ({}));
    if ((pendingCount ?? 0) > 0 || hasPending) {
      throw new Error(t('pendingReviewRequired').replace('{count}', pendingCount ?? 1));
    }
  };

  const createPendingPaymentReservation = async () => {
    const resId = makeReservationId();
    const guestBookingToken = booking.guestBookingToken ?? makeGuestBookingToken();
    const basePayload = buildReservationPayload({
      id: resId,
      vehicle: v,
      ownerId: v.ownerId ?? v.owner_id ?? v.owner_auth_id ?? null,
      userId: currentUser?.id ?? null,
      pickup,
      ret,
      days,
      total: totalAmt,
      status: isClassBased ? 'pending_assignment' : 'pending',
      type: v.type ?? 'corporate',
      opts,
      pickupLoc,
      retLoc,
      guestName: requiredBookingInfo.name,
      guestEmail: requiredBookingInfo.email,
      guestPhone: requiredBookingInfo.phone,
      guestBookingToken: null,
      contactHandles: requiredBookingInfo.contactHandles ?? {},
      idpFileName: requiredBookingInfo.idpFileName ?? null,
      idpExpiresOn: requiredBookingInfo.idpExpiresOn ?? null,
      oneWayLocationId: opts.onewayLocationId ?? null,
      oneWayFee: onewayAmt,
    });
    const pendingPayload = {
      ...basePayload,
      status: isClassBased ? 'pending_assignment' : 'payment_pending',
    };
    await saveReservationBeforePayment(pendingPayload);
    // 異地还车：予約に紐づく取り決めを自動作成（費用はユーザー決済に上乗せ済み）
    if (cr?.receivingOwnerId && !isClassBased) {
      fetch('/api/owner/cross-return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'create',
          originOwnerId: cr.originOwnerId ?? v.ownerId ?? v.owner_id ?? v.owner_auth_id ?? null,
          receivingOwnerId: cr.receivingOwnerId,
          reservationId: resId,
          vehicleId: basePayload.vehicleId ?? v.id ?? null,
          sharePhotos: true,
          baseFee: crossReturnFee.baseFee,
          feeTotal: crossReturnAmt,
        }),
      }).catch(() => { /* 予約は継続。取り決めは後から手動作成も可 */ });
    }
    return { resId, guestBookingToken, basePayload, pendingPayload };
  };

  const createPaymentIntent = async ({ resId, basePayload }, extra = {}) => {
    const piRes = await fetch('/api/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmt, reservationId: resId,
        userId: currentUser?.id ?? '', vehicleId: basePayload.vehicleId ?? '',
        email: requiredBookingInfo.email || currentUser?.email || '',
        ...extra,
      }),
    });
    const data = await piRes.json();
    if (data.error) throw new Error(data.error);
    return data; // { clientSecret?, customerId?, demo?, status?, requiresAction?, paymentIntentId? }
  };

  // ── Apple Pay / Google Pay via Stripe Checkout（どの端末でも動く） ──────
  // Stripe のホスト型決済ページへ遷移。Apple Pay は Safari、Google Pay は
  // Chrome で表示されるため、対応ブラウザで開くよう best-effort でディープリンク。
  const openWalletCheckout = (url, wallet) => {
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isAndroid = /Android/i.test(ua);
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      if (wallet === 'google') {
        if (isIOS) {
          const chromeUrl = url.replace(/^https:\/\//, 'googlechromes://');
          const fallback = setTimeout(() => { window.location.href = url; }, 1500);
          window.addEventListener('pagehide', () => clearTimeout(fallback), { once: true });
          window.location.href = chromeUrl;
          return;
        }
        if (isAndroid) {
          const noScheme = url.replace(/^https?:\/\//, '');
          window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
          return;
        }
        window.location.href = url;
        return;
      }
      // apple → Safari（アプリ内ブラウザからは外部起動を試みる）
      const win = window.open(url, '_blank');
      if (!win) window.location.href = url;
    } catch {
      window.location.href = url;
    }
  };

  const payWithWallet = async (wallet) => {
    setPayError('');
    if (!opts.damageConsent) { setPayError(t('sc_consentRequired')); return; }
    if (!opts.signature?.dataUrl) { setPayError(t('sig_required')); return; }
    if (!(Math.round(Number(totalAmt)) >= 50)) { setPayError(t('pay_amountTooLow')); return; }
    if (!currentUser?.id) {
      setPayError(t('authRequiredBooking'));
      dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
      return;
    }
    setPaying(true);
    try {
      await ensureNoPendingReservation();
      const pending = await createPendingPaymentReservation();
      // 受取まで7日以上先なら、ウォレットでも「今は課金せずカード保存のみ」。
      // 課金は /api/cron/charge-due が受取7日前に自動実行（早期キャンセルでも手数料ゼロ）。
      const walletChargeAtMs = new Date(pickup).getTime() - 7 * 24 * 60 * 60 * 1000;
      const walletDefer = !isClassBased && Number.isFinite(walletChargeAtMs) && walletChargeAtMs > Date.now();
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalAmt,
          reservationId: pending.resId,
          userId: currentUser?.id ?? '',
          vehicleId: pending.basePayload.vehicleId ?? '',
          email: requiredBookingInfo.email || currentUser?.email || '',
          vehicleName: isClassBased
            ? classLabel(v.targetClass ?? v.cls)
            : `${v.maker ?? ''} ${v.model ?? ''}`.trim(),
          locale,
          wallet,
          defer: walletDefer,
        }),
      });
      const data = await res.json();
      if (data.demo) {
        await completePaidReservation({ ...pending, paymentIntent: { id: 'demo' } });
        setPaying(false);
        return;
      }
      if (data.error || !data.url) throw new Error(data.error || t('unsupportedPayment'));
      openWalletCheckout(data.url, wallet);
      // Stripe Checkout へ遷移。確定は webhook（payment_intent.succeeded）で処理。
    } catch (err) {
      setPayError(err.message ?? 'Checkout failed');
      setPaying(false);
    }
  };

  const completePaidReservation = async ({ resId, basePayload, guestBookingToken, paymentIntent }) => {
    const resPayload = {
      ...basePayload,
      status: isClassBased ? 'pending_assignment' : 'confirmed',
      stripePaymentIntentId: paymentIntent.id,
    };
    const savedReservation = await finalizeReservationAfterPayment({
      id: resId,
      status: resPayload.status,
      stripePaymentIntentId: resPayload.stripePaymentIntentId,
      paymentStatus: 'paid',
    });

    dispatch({ type: 'ADD_RES_LOCAL', r: { ...(savedReservation ?? resPayload), paymentStatus: 'paid' } });
    dispatch({ type: 'TOAST', msg: t('bookingConfirmedToast').replace('{id}', resId) });
    dispatch({ type: 'BOOK_STEP', patch: { step: 7, guestBookingToken, lastReservation: resPayload } });
  };

  // Card saved now, authorized 7 days before pickup, captured at handover.
  const completeScheduledReservation = async ({ resId, basePayload, guestBookingToken, customerId, paymentMethodId, chargeAtISO }) => {
    const savedReservation = await finalizeReservationAfterPayment({
      id: resId,
      status: isClassBased ? 'pending_assignment' : 'confirmed',
      paymentStatus: 'scheduled',
      stripeCustomerId: customerId ?? null,
      stripePaymentMethodId: paymentMethodId ?? null,
      chargeAt: chargeAtISO,
    });
    const resPayload = {
      ...basePayload,
      status: isClassBased ? 'pending_assignment' : 'confirmed',
      paymentStatus: 'scheduled',
      stripeCustomerId: customerId ?? null,
      stripePaymentMethodId: paymentMethodId ?? null,
      chargeAt: chargeAtISO,
    };
    dispatch({ type: 'ADD_RES_LOCAL', r: savedReservation ?? resPayload });
    dispatch({ type: 'TOAST', msg: t('bk_cardSavedToast').replace('{date}', new Date(chargeAtISO).toLocaleDateString()) });
    dispatch({ type: 'BOOK_STEP', patch: { step: 7, guestBookingToken, lastReservation: resPayload } });
  };

  const confirmWalletPayment = async ({ stripe, paymentMethodId, payer }) => {
    setPayError('');
    if (!(Math.round(Number(totalAmt)) >= 50)) {
      setPayError(t('pay_amountTooLow'));
      return { ok: false };
    }
    setPaying(true);
    let pendingReservationId = null;
    let paymentSucceeded = false;
    try {
      await ensureNoPendingReservation();
      const pending = await createPendingPaymentReservation();
      pendingReservationId = pending.resId;
      const piData = await createPaymentIntent(pending);
      if (piData.demo) {
        paymentSucceeded = true;
        await completePaidReservation({ ...pending, paymentIntent: { id: 'demo' } });
        return { ok: true };
      }
      const clientSecret = piData.clientSecret;
      const billingDetails = {
        name: payer?.name || requiredBookingInfo.name || currentUser?.name || '',
        email: payer?.email || requiredBookingInfo.email || currentUser?.email || '',
        phone: payer?.phone || requiredBookingInfo.phone || currentUser?.phone || '',
      };
      let result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethodId,
        payment_method_options: {
          card: {},
        },
        receipt_email: billingDetails.email || undefined,
      }, { handleActions: false });
      if (result.error) throw new Error(result.error.message);
      if (result.paymentIntent?.status === 'requires_action') {
        result = await stripe.confirmCardPayment(clientSecret);
        if (result.error) throw new Error(result.error.message);
      }
      paymentSucceeded = true;
      await completePaidReservation({ ...pending, paymentIntent: result.paymentIntent });
      return { ok: true };
    } catch (err) {
      if (pendingReservationId && !paymentSucceeded) {
        await finalizeReservationAfterPayment({ id: pendingReservationId, status: 'cancelled' }).catch(() => null);
      }
      const message = err.message || t('paymentFailed');
      setPayError(message);
      return { ok: false, error: message };
    } finally {
      setPaying(false);
    }
  };

  // ── Payment confirm ──────────────────────────────────────
  const confirm = async () => {
    setPayError('');
    if (!opts.damageConsent) { setPayError(t('sc_consentRequired')); return; }
    if (!opts.signature?.dataUrl) { setPayError(t('sig_required')); return; }
    if (!(Math.round(Number(totalAmt)) >= 50)) {
      setPayError(t('pay_amountTooLow'));
      return;
    }
    setPaying(true);
    let pendingReservationId = null;
    let paymentSucceeded = false;
    try {
      await ensureNoPendingReservation();

      if (payment !== 'card') {
        setPayError(t('unsupportedPayment'));
        setPaying(false);
        return;
      }

      const usingSaved = selectedCard && !selectedCard.demo
        && selectedCard.paymentMethodId && selectedCard.customerId;

      // 新規カード入力のときはStripe要素が必要
      if (!usingSaved && !selectedCard?.demo && (!stripeRef.current || !cardElRef.current)) {
        setPayError(t('paymentFormNotReady'));
        setPaying(false);
        return;
      }

      const pending = await createPendingPaymentReservation();
      const { resId, guestBookingToken, basePayload } = pending;
      pendingReservationId = resId;

      // Defer charge: if pickup is > 7 days away, only SAVE the card now and let
      // /api/cron/charge-due charge it at (pickup − 7 days). No charge now → no
      // Stripe processing fee is lost if the customer cancels within the free window.
      const chargeAtMs = new Date(pickup).getTime() - 7 * 24 * 60 * 60 * 1000;
      const deferCharge = !isClassBased && Number.isFinite(chargeAtMs) && chargeAtMs > Date.now();
      const chargeAtISO = Number.isFinite(chargeAtMs) ? new Date(chargeAtMs).toISOString() : null;

      if (usingSaved && deferCharge) {
        // ── 保存済みカード：課金は受取7日前に自動実行（今は課金しない）──
        paymentSucceeded = true;
        await completeScheduledReservation({ resId, basePayload, guestBookingToken, customerId: selectedCard.customerId, paymentMethodId: selectedCard.paymentMethodId, chargeAtISO });

      } else if (usingSaved) {
        // ── 保存済みカードでオフセッション決済（即時：受取7日以内）──
        const piData = await createPaymentIntent(pending, {
          useSaved: true, customerId: selectedCard.customerId, paymentMethodId: selectedCard.paymentMethodId,
        });
        if (piData.requiresAction && stripeRef.current) {
          const { error: actErr } = await stripeRef.current.confirmCardPayment(piData.clientSecret);
          if (actErr) {
            await finalizeReservationAfterPayment({ id: resId, status: 'cancelled' }).catch(() => null);
            setPayError(actErr.message); setPaying(false); return;
          }
        }
        paymentSucceeded = true;
        await completePaidReservation({ resId, basePayload, guestBookingToken, paymentIntent: { id: piData.paymentIntentId ?? 'saved' } });

      } else if (deferCharge) {
        // ── 新規カード：カード保存のみ（課金は受取7日前に自動実行）──
        const piData = await createPaymentIntent(pending, { mode: 'setup', saveCard: true });
        if (piData.demo) {
          paymentSucceeded = true;
          await completeScheduledReservation({ resId, basePayload, guestBookingToken, customerId: null, paymentMethodId: null, chargeAtISO });
        } else {
          const { setupIntent, error: setupErr } = await stripeRef.current.confirmCardSetup(piData.setupClientSecret, {
            payment_method: {
              card: cardElRef.current,
              billing_details: {
                name:  info.cardName || info.name || currentUser?.name || '',
                email: info.email    || currentUser?.email || '',
                phone: info.phone    || currentUser?.phone || '',
              },
            },
          });
          if (setupErr) {
            await finalizeReservationAfterPayment({ id: resId, status: 'cancelled' }).catch(() => null);
            setPayError(setupErr.message); setPaying(false); return;
          }
          paymentSucceeded = true;
          await completeScheduledReservation({ resId, basePayload, guestBookingToken, customerId: piData.customerId, paymentMethodId: setupIntent.payment_method, chargeAtISO });
          if (currentUser?.id && piData.customerId) {
            await fetch('/api/cards', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id, customerId: piData.customerId }),
            }).catch(() => {});
          }
        }

      } else {
        // ── 新規カード（即時課金：受取7日以内）──────────────
        const piData = await createPaymentIntent(pending, { saveCard: saveCardOn });

        // デモモード（Stripe未設定）
        if (piData.demo) {
          paymentSucceeded = true;
          await completePaidReservation({ resId, basePayload, guestBookingToken, paymentIntent: { id: 'demo' } });
          if (saveCardOn && currentUser?.id) {
            await fetch('/api/cards', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id, brand: 'card', last4: '••••' }),
            }).catch(() => {});
          }
        } else {
          const { paymentIntent, error: stripeError } = await stripeRef.current.confirmCardPayment(piData.clientSecret, {
            payment_method: {
              card: cardElRef.current,
              billing_details: {
                name:  info.cardName || info.name || currentUser?.name || '',
                email: info.email    || currentUser?.email || '',
                phone: info.phone    || currentUser?.phone || '',
              },
            },
          });
          if (stripeError) {
            await finalizeReservationAfterPayment({ id: resId, status: 'cancelled' }).catch(() => null);
            setPayError(stripeError.message);
            setPaying(false);
            return;
          }
          paymentSucceeded = true;
          await completePaidReservation({ resId, basePayload, guestBookingToken, paymentIntent });
          // 保存（次回自動入力用）— Stripeから下4桁等のマスク情報を取得して保存
          if (saveCardOn && currentUser?.id && piData.customerId) {
            await fetch('/api/cards', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id, customerId: piData.customerId }),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      if (pendingReservationId && !paymentSucceeded) {
        await finalizeReservationAfterPayment({ id: pendingReservationId, status: 'cancelled' }).catch(() => null);
      }
      setPayError(err.message || t('paymentFailed'));
    } finally {
      setPaying(false);
    }
  };

  return (
    <Modal open onClose={() => dispatch({ type: 'CLOSE_BOOKING' })} wide>
      <div className="p-4 sm:p-6">

        {/* Anime Booking Desk */}
        <div className="mb-5 rounded-2xl border border-purple-100 bg-white p-3 text-purple-900 shadow-sm">
          <div className="flex items-center gap-3">
            <img
              src={guide.image}
              alt={guide.name}
              className="h-12 w-12 rounded-xl object-cover border border-purple-100 sm:h-14 sm:w-14"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-purple-500">Anime Booking Desk</p>
              <p className="text-sm font-bold text-purple-900">{guide.name} · {t(guide.titleKey)}</p>
              <p className="text-xs text-purple-700/80">{t(guide.bodyKey)}</p>
            </div>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-shrink-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i + 1 === step ? 'text-white' : i + 1 < step ? 'text-white bg-green-600' : 'bg-gray-700 text-gray-400'
                }`}
                style={i + 1 === step ? { background: g } : {}}
              >
                {i + 1 < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs whitespace-nowrap hidden md:inline ${i + 1 === step ? 'text-white font-semibold' : 'text-gray-500'}`}>{s}</span>
              {i < steps.length - 1 && <div className={`w-4 h-px mx-1 flex-shrink-0 ${i + 1 < step ? 'bg-green-600' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1 — Date & Time ─────────────────────────────── */}
        {step === 1 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">📅 {hasPresetDates ? t('dateConfirmationTitle') : t('selectDates')}</h3>

            {hasPresetDates ? (
              <div className="mb-4 rounded-2xl border border-purple-600/40 bg-purple-900/20 p-4">
                <p className="mb-3 text-xs leading-relaxed text-purple-100/80">{t('dateConfirmationBody')}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-900/55 px-3 py-3">
                    <span className="text-xs font-semibold text-gray-400">{t('pickupDateTime')}</span>
                    <span className="text-right text-sm font-black text-white">{formatBookingDateTime(pickup, locale)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-900/55 px-3 py-3">
                    <span className="text-xs font-semibold text-gray-400">{t('returnDateTime')}</span>
                    <span className="text-right text-sm font-black text-white">{formatBookingDateTime(ret, locale)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-900/55 px-3 py-3">
                    <span className="text-xs font-semibold text-gray-400">{t('duration')}</span>
                    <span className="text-right text-sm font-black text-purple-200">{days} {days > 1 ? t('days') : t('day')}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => b({ datePreset: false })}
                  className="mt-3 w-full rounded-xl border border-purple-400/50 px-3 py-2.5 text-xs font-bold text-purple-100 active:scale-95"
                >
                  {t('dateChangeCta')}
                </button>
              </div>
            ) : (
              <>
                {/* 空き状況カレンダー */}
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">{t('calendarHint')}</p>
                  <AvailabilityCalendar
                    vehicleId={isClassBased ? null : activeVehicleId}
                    theme={theme}
                    onSelect={({ pickup: p, ret: r }) => {
                      b({ pickup: p, ret: r });
                      setDtError('');
                    }}
                  />
                </div>

                <p className="text-xs text-gray-500 mb-2">{t('manualInput')}</p>
                <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {t('pickupDateTime')} <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={pickup}
                      min={nowLocalStr}
                      onChange={e => handlePickupChange(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={`w-full bg-gray-800 border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors ${
                        isDtComplete(pickup) ? 'border-green-600' : 'border-gray-700 focus:border-blue-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {t('returnDateTime')} <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={ret}
                      min={retMinStr}
                      disabled={!isDtComplete(pickup)}
                      onChange={e => {
                        if (pickup && new Date(e.target.value) <= new Date(pickup)) {
                          setDtError(t('returnAfterPickup'));
                          return;
                        }
                        b({ ret: e.target.value }); setDtError('');
                      }}
                      style={{ colorScheme: 'dark' }}
                      className={`w-full bg-gray-800 border text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDtComplete(ret) ? 'border-green-600' : 'border-gray-700 focus:border-blue-500'
                      }`}
                    />
                  </div>
                </div>
              </>
            )}

            {dtError && (
              <div className="mb-3 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-sm">
                ⚠️ {dtError}
              </div>
            )}
            {step1Valid && (
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-blue-300 text-sm">
                🗓 {t('duration')}: <strong>{days} {days > 1 ? t('days') : t('day')}</strong>
              </div>
            )}
            {!step1Valid && !dtError && (
              <div className="p-3 bg-gray-800/40 border border-gray-700 rounded-xl text-gray-500 text-xs">
                📌 {t('dateTimeHelp')}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 — Vehicle Confirmation ────────────────────── */}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-4">{isClassBased ? t('classPlanConfirmation') : t('vehicleConfirmation')}</h3>
            {v.img && <img src={v.img} alt="" className="w-full h-48 object-contain bg-gray-100 rounded-xl mb-4" />}
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <div className="text-white font-bold text-lg">
                {isClassBased ? `${classLabel(v.targetClass ?? v.cls)} ${t('runOfFleetPlan')}` : `${v.maker ?? ''} ${v.model ?? ''}`.trim()}
              </div>
              <div className="text-gray-400 text-sm mb-3">
                {isClassBased ? t('classAssignedLater') : `${v.year} · ${v.grade}`}
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm text-gray-300 sm:grid-cols-3">
                <span>👥 {v.pax} {t('seats')}</span>
                <span>⚡ {v.fuel}</span>
                <span>🔧 {v.trans}</span>
                <span>📍 {v.loc}</span>
                <span>💴 {format(priceDay)}{t('perDay')}{currency !== 'JPY' && <span className="text-gray-400"> (¥{priceDay.toLocaleString()})</span>}</span>
                {isClassBased && <span>🟣 {t('availableCount')} {v.classAvailable ?? '-'}</span>}
                {deposit > 0 && <span>🔒 Deposit ¥{deposit.toLocaleString()}</span>}
              </div>
            </div>
            {isClassBased && (
              <label
                onClick={() => { setClassAck(a => !a); setClassAckError(false); }}
                className={`mb-2 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-all ${
                  classAck
                    ? 'border-purple-500 bg-purple-900/20 text-purple-100'
                    : classAckError
                      ? 'border-red-500 bg-red-900/20 text-red-100'
                      : 'border-purple-500/40 bg-purple-900/10 text-purple-100 hover:border-purple-400'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs font-bold ${
                    classAck ? 'border-purple-400 bg-purple-500 text-white' : 'border-gray-500 bg-gray-800 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span>{t('classRandomAssignAck')}</span>
              </label>
            )}
            {isClassBased && classAckError && !classAck && (
              <p className="mb-4 text-xs font-semibold text-red-400">{t('classRandomAssignError')}</p>
            )}
            {v.holder && (
              <div className="flex items-center gap-3 p-3 bg-violet-900/20 border border-violet-700/30 rounded-xl">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: g }}>{v.holder.av}</div>
                <div>
                  <div className="text-white text-sm font-semibold">{v.holder.name}</div>
                  <div className="text-gray-400 text-xs">★{v.holder.rating} · Response {v.holder.resp}</div>
                </div>
              </div>
            )}
            {!isClassBased && activeVehicleId && <PublicReviews vehicleId={activeVehicleId} t={t} />}
          </div>
        )}

        {/* ── STEP 3 — Add-ons ─────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-5">⚙️ Additional Services</h3>

            {/* 補償プラン選択 */}
            <div className="mb-6">
              <InsurancePlanSelector
                plans={insurancePlanOptions}
                value={selectedInsuranceId}
                onChange={(id) => b({ opts: { ...opts, insurancePlan: id } })}
                t={t}
              />
            </div>

            <div className="border-t border-gray-800 pt-5 mb-3">
              <h4 className="text-white font-semibold text-sm">🧰 {t('bookingStepAddons') || 'Add-ons'}</h4>
            </div>

            {addonsLoading ? (
              <div className="text-gray-400 text-sm text-center py-8">{t('bm_loading')}</div>
            ) : storeAddons.length > 0 ? (
              storeAddons.map(addon => {
                const key     = `custom_${addon.id}`;
                const checked = Boolean(opts[key]);
                const subtext = addon.price_type === 'per_day'
                  ? `¥${addon.price.toLocaleString()}/day`
                  : `¥${addon.price.toLocaleString()} flat`;
                return (
                  <div
                    key={addon.id}
                    onClick={() => b({ opts: { ...opts, [key]: !checked } })}
                    className={`flex items-center justify-between p-4 rounded-xl border mb-3 cursor-pointer transition-all ${
                      checked ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{addon.icon}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{addon.name}</div>
                        <div className="text-gray-400 text-xs">
                          {subtext}{addon.description ? ` · ${addon.description}` : ''}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center text-xs ${checked ? 'text-white' : 'bg-gray-700 text-gray-500'}`}
                      style={checked ? { background: g } : {}}
                    >
                      {checked ? '✓' : ''}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-xs py-2">{t('noAddonsAvailable') || 'No optional add-ons for this vehicle.'}</p>
            )}

            {v.type === 'corporate' && (
              <div className="mt-5 border-t border-gray-800 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-white font-semibold text-sm">One-Way Return</h4>
                    <p className="text-gray-500 text-xs">{t('bm_returnLocNote')}</p>
                  </div>
                  <button
                    onClick={() => b({ opts: { ...opts, oneway: !opts.oneway, onewayLocationId: opts.oneway ? null : opts.onewayLocationId } })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${opts.oneway ? 'text-white border-transparent' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                    style={opts.oneway ? { background: g } : {}}
                  >
                    {opts.oneway ? 'Enabled' : 'Add'}
                  </button>
                </div>
                {opts.oneway && (
                  <div className="space-y-2">
                    {oneWayLoading ? (
                      <p className="text-gray-500 text-sm py-3">{t('bm_loadingReturnLoc')}</p>
                    ) : oneWayLocations.length > 0 ? (
                      oneWayLocations.map(loc => {
                        const active = String(opts.onewayLocationId) === String(loc.id);
                        return (
                          <button
                            key={loc.id}
                            onClick={() => b({ opts: { ...opts, oneway: true, oneWayLocationId: loc.id } })}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                              active ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                            }`}
                          >
                            <span>
                              <span className="block text-white text-sm font-medium">{loc.name}</span>
                              {loc.address && <span className="block text-gray-500 text-xs">{loc.address}</span>}
                            </span>
                            <span className="text-purple-300 text-sm font-bold">+¥{Number(loc.price ?? 0).toLocaleString()}</span>
                          </button>
                        );
                      })
                    ) : (
                      <button
                        onClick={() => b({ opts: { ...opts, oneway: true, oneWayLocationId: null } })}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-700 bg-gray-800/40 text-left"
                      >
                        <span>
                          <span className="block text-white text-sm font-medium">Standard one-way return</span>
                          <span className="block text-gray-500 text-xs">{t('bm_applyDefaultFee')}</span>
                        </span>
                        <span className="text-purple-300 text-sm font-bold">+¥3,300</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {deposit > 0 && (
              <div className="p-4 bg-amber-900/20 border border-amber-700/30 rounded-xl text-amber-300 text-sm mt-2">
                💰 Security Deposit: ¥{deposit.toLocaleString()} (refunded after return)
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4 — Price breakdown ─────────────────────────── */}
        {step === 4 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-5">💴 Price Breakdown</h3>
            <div className="bg-gray-800 rounded-xl p-5 mb-5">
              {[
                { label: `${t('vehicleRentalLabel')} (${days} day${days > 1 ? 's' : ''} × ¥${v.priceDay?.toLocaleString()})`, amt: baseAmt, show: true },
                { label: `${t('ins_breakdownLabel')}: ${t(`ins_${selectedInsurancePlan?.id}_name`)} (${days} day${days > 1 ? 's' : ''})`, amt: insAmt, show: insAmt > 0 },
                { label: t('deliveryFeeLabel'), amt: deliveryAmt, show: deliveryAmt > 0 },
                { label: selectedOneWayLocation ? `One-Way Return: ${selectedOneWayLocation.name}` : 'One-Way Return Fee', amt: onewayAmt, show: opts.oneway },
                { label: `${t('cr_baseFee')}${cr?.location ? `: ${cr.location}` : ''}`, amt: crossReturnFee.baseFee, show: Boolean(cr && crossReturnFee.baseFee > 0) },
                { label: `${t('cr_receiverFee')}${cr?.location ? `: ${cr.location}` : ''}`, amt: crossReturnFee.receiverFee, show: Boolean(cr && crossReturnFee.receiverFee > 0) },
                ...storeAddons
                  .filter(a => opts[`custom_${a.id}`])
                  .map(a => ({
                    label: `${a.icon} ${a.name}${a.price_type === 'per_day' ? ` (${days}${t('bm_daysUnit')})` : ''}`,
                    amt: a.price_type === 'per_day' ? a.price * days : a.price,
                    show: true,
                  })),
                ...(deposit > 0 ? [{ label: 'Security Deposit (refundable)', amt: deposit, show: true }] : []),
              ].filter(r => r.show).map(r => (
                <div key={r.label} className="flex justify-between py-2 border-b border-gray-700 text-sm">
                  <span className="text-gray-300">{r.label}</span>
                  <span className="text-white font-mono">¥{r.amt?.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-bold text-lg">
                <span className="text-white">Total</span>
                <span className="font-mono" style={{ color: theme.accent }}>¥{totalAmt.toLocaleString()}</span>
              </div>
              {currency !== 'JPY' && (
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-500">{t('fxApprox')} ({currency})</span>
                  <span className="font-mono text-gray-300">≈ {format(totalAmt)}</span>
                </div>
              )}
            </div>
            {deliveryAmt > 0 && (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-sm text-amber-200 mb-3">
                🚚 {t('deliveryFeeNote')}
              </div>
            )}
            {isPartnerVehicle && (
              <div className="bg-sky-900/20 border border-sky-700/30 rounded-xl p-3 text-sm text-sky-200 mb-3">
                🛡 {t('serviceStandardPromise')}
              </div>
            )}
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 text-sm text-emerald-300">
              <p className="font-semibold">🛡 {t('policyCancelTitle')}</p>
              <p className="text-emerald-300/80 text-xs mt-1 leading-relaxed">{t('policyCancelBody')}</p>
            </div>
          </div>
        )}

        {/* ── STEP 5 — User info ───────────────────────────────── */}
        {step === 5 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-5">👤 Your Information</h3>
            {currentUser && (
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-blue-300 text-sm mb-4">✓ Auto-filled from your profile</div>
            )}
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-amber-200 text-sm mb-4">
              Luggage capacity is an estimate. Actual capacity may vary based on luggage shape and passenger count.<br />
              {t('bm_luggageNote')}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t('fullName')}      value={requiredBookingInfo.name} onChange={val => b({ info: { ...info, name: val } })}   className="sm:col-span-2" />
              <Input label={t('email')}          value={requiredBookingInfo.email} onChange={val => b({ info: { ...info, email: val } })}   type="email" />
              <CountryPhoneInput label={t('phone')} value={requiredBookingInfo.phone} onChange={val => b({ info: { ...info, phone: val } })} />
              <Select label={t('nationality')} value={requiredBookingInfo.nat || ''} onChange={val => b({ info: { ...info, nat: val } })}
                      options={[{ value: '', label: '— ' + t('selectCountry') + ' —' }, ...countryOptions]} className="sm:col-span-2" />
              {/* Driver License 番号の入力欄は廃止（不要化） */}
              {v.type === 'corporate' && (
                <Input label={t('flightNoOptional')} value={info.flight || ''} onChange={val => b({ info: { ...info, flight: val } })} placeholder="JL123" className="sm:col-span-2" />
              )}
            </div>

            {/* IDP（国際免許証）— 任意。返金免責の注意書きを表示 */}
            <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/20 p-3 text-amber-200 text-xs leading-relaxed">
              ⚠️ {t('idpDisclaimer')}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t('idpExpiryOptional')} value={requiredBookingInfo.idpExpiresOn} onChange={val => b({ info: { ...info, idpExpiresOn: val } })} type="date" />
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('idpUploadOptional')}</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={async e => {
                    try {
                      const saved = await readBookingIdpFile(e.target.files?.[0]);
                      if (saved) b({ info: { ...info, idpFileName: saved.name, idpFileDataUrl: saved.dataUrl } });
                      setPayError('');
                    } catch (error) {
                      setPayError(error.message);
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-300 rounded-xl px-3 py-2 text-sm"
                />
                {requiredBookingInfo.idpFileName && <p className="text-xs text-violet-300 mt-1">{requiredBookingInfo.idpFileName}</p>}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs text-gray-400 mb-2">SNS contact channel *</label>
              <div className="flex flex-wrap gap-2">
                {SNS_CHANNELS.map(ch => {
                  const active = (requiredBookingInfo.channels ?? []).includes(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() => {
                        const cur = requiredBookingInfo.channels ?? [];
                        b({ info: { ...info, channels: active ? cur.filter(x => x !== ch) : [...cur, ch] } });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${active ? 'text-white border-transparent' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                      style={active ? { background: g } : {}}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {SNS_CHANNELS.map(ch => (
                  <Input
                    key={ch}
                    label={`${ch} handle`}
                    value={requiredBookingInfo.contactHandles?.[ch] ?? ''}
                    onChange={val => b({ info: { ...info, contactHandles: { ...(info.contactHandles ?? {}), [ch]: val } } })}
                    placeholder="@your-id"
                  />
                ))}
              </div>
            </div>
            {step === 5 && payError && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-sm">
                ❌ {payError}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 6 — Payment ─────────────────────────────────── */}
        {step === 6 && (
          <div>
            <h3 className="text-lg font-bold text-white mb-2">💳 Payment</h3>
            <div className="flex items-center justify-between mb-5 p-3 bg-gray-800/50 border border-gray-700 rounded-xl">
              <div className="flex items-center gap-2">
                <svg height="18" viewBox="0 0 60 25" xmlns="http://www.w3.org/2000/svg">
                  <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.23c0-1.85-1.03-2.58-2.06-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V6.27h3.64l.24 1.07c.56-.72 1.63-1.37 3.15-1.37 2.96 0 5.64 2.52 5.64 7.16 0 5.12-2.7 7.17-5.63 7.17zM40 9.32c-.95 0-1.54.34-1.94.73l.02 5.58c.35.3.93.72 1.92.72 1.54 0 2.59-1.41 2.59-3.54 0-2.07-1.05-3.49-2.59-3.49zM28.24 5.07c-1.44 0-2.32-.58-2.32-2.05 0-1.23.88-2.01 2.32-2.01 1.44 0 2.33.77 2.33 2.01 0 1.47-.89 2.05-2.33 2.05zm-2.1 15.29V6.27h4.12V20.36h-4.12zM21.62 20.36V11.3c0-3.81-2.17-5.48-5.07-5.48-1.8 0-3.11.63-4.24 1.5l-.24-1.05h-3.64v14.09h4.12v-9.64c.47-.36 1.22-.68 2.09-.68 1.28 0 2.16.68 2.16 2.47v7.85h4.82zM4.38 20.36H0V6.27h4.38v14.09z" fill="#6772E5" />
                </svg>
                <span className="text-gray-400 text-sm">Powered by Stripe</span>
              </div>
              <div className="text-right">
                <span className="text-white font-bold text-lg">¥{totalAmt.toLocaleString()}</span>
                {currency !== 'JPY' && <p className="text-xs text-gray-400">≈ {format(totalAmt)} {currency}</p>}
              </div>
            </div>

            {(!isClassBased && pickup && (new Date(pickup).getTime() - Date.now()) > 7 * 24 * 60 * 60 * 1000) && (
              <div className="mb-5 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl text-emerald-200 text-xs leading-relaxed">
                {t('bk_payScheduledNote').replace('{date}', new Date(new Date(pickup).getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString())}
              </div>
            )}

            {/* 損害補償の同意（¥0カード登録） — 決済前に必須 */}
            <div className="mb-4">
              <DamageConsent
                checked={Boolean(opts.damageConsent)}
                onToggle={() => b({ opts: { ...opts, damageConsent: !opts.damageConsent, damageConsentAt: !opts.damageConsent ? new Date().toISOString() : null } })}
              />
            </div>

            {/* 電子署名 — 契約内容に同意のうえサイン（予約確定に必須） */}
            <div className="mb-4">
              <SignaturePad
                value={opts.signature}
                onChange={(sig) => b({ opts: { ...opts, signature: sig } })}
                t={t}
              />
            </div>

            {/* Apple Pay / Google Pay — Stripe Checkout（どの端末でも決済可） */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-2">{t('pay_walletExpress')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => payWithWallet('apple')}
                  disabled={paying}
                  className="flex items-center justify-center gap-2 rounded-xl bg-black text-white py-3.5 text-sm font-bold border border-gray-600 active:scale-[0.98] disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.79.9-2.09 1.6-3.16 1.51-.14-1.1.44-2.27 1.09-3 .73-.82 2.03-1.44 3.18-1.49zM20.5 17.02c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.52-4.12 3.53-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.02-4.07 1-1.73-.02-3.06-1.78-4.05-3.34-2.77-4.38-3.06-9.52-1.35-12.25C2.44 4.09 4.42 2.91 6.28 2.91c1.9 0 3.09 1.03 4.66 1.03 1.52 0 2.45-1.03 4.65-1.03 1.66 0 3.42.9 4.68 2.46-4.11 2.25-3.44 8.11.23 9.65z"/>
                  </svg>
                  Apple Pay
                </button>
                <button
                  type="button"
                  onClick={() => payWithWallet('google')}
                  disabled={paying}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white text-gray-900 py-3.5 text-sm font-bold border border-gray-300 active:scale-[0.98] disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.75-2.1-6.69-4.94H1.3v3.1A12 12 0 0 0 12 24z"/>
                    <path fill="#FBBC05" d="M5.31 14.31a7.2 7.2 0 0 1 0-4.62v-3.1H1.3a12 12 0 0 0 0 10.82l4.01-3.1z"/>
                    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.3 6.59l4.01 3.1C6.25 6.85 8.89 4.75 12 4.75z"/>
                  </svg>
                  Google Pay
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">{t('pay_walletCheckoutNote')}</p>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-500">{t('pay_or')}</span>
              <div className="h-px flex-1 bg-gray-800" />
            </div>

            <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2">
              {[
                { id: 'card', icon: '💳', label: t('cardPayment') },
              ].map(pm => (
                <div
                  key={pm.id}
                  onClick={() => b({ payment: pm.id })}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${payment === pm.id ? '' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`}
                  style={payment === pm.id ? { background: `${theme.primary}20`, borderColor: theme.primary, borderWidth: 1, borderStyle: 'solid' } : {}}
                >
                  <span className="text-lg">{pm.icon}</span>
                  <span className={`text-sm font-medium ${payment === pm.id ? 'text-white' : 'text-gray-300'}`}>{pm.label}</span>
                  {payment === pm.id && <span className="ml-auto text-xs" style={{ color: theme.accent }}>✓</span>}
                </div>
              ))}
            </div>

            {payment === 'card' && (
              <div className="mb-4">

                {/* 保存済みカード（次回は自動入力） */}
                {savedCards.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs text-gray-400 mb-1">{t('savedCards')}</p>
                    {savedCards.map(c => (
                      <div key={c.id}
                        onClick={() => setSelectedCard(c)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedCard?.id === c.id ? '' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                        }`}
                        style={selectedCard?.id === c.id ? { background: `${theme.primary}20`, borderColor: theme.primary, borderWidth: 1, borderStyle: 'solid' } : {}}
                      >
                        <span className="text-lg">💳</span>
                        <span className="text-sm text-white font-medium capitalize">{c.brand}</span>
                        <span className="text-sm text-gray-300 font-mono">•••• {c.last4}</span>
                        {c.expMonth && <span className="text-xs text-gray-500">{c.expMonth}/{String(c.expYear).slice(-2)}</span>}
                        {selectedCard?.id === c.id && <span className="ml-auto text-xs" style={{ color: theme.accent }}>✓</span>}
                      </div>
                    ))}
                    <div
                      onClick={() => setSelectedCard(null)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedCard === null ? '' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                      }`}
                      style={selectedCard === null ? { background: `${theme.primary}20`, borderColor: theme.primary, borderWidth: 1, borderStyle: 'solid' } : {}}
                    >
                      <span className="text-lg">➕</span>
                      <span className="text-sm text-gray-200">{t('useNewCard')}</span>
                      {selectedCard === null && <span className="ml-auto text-xs" style={{ color: theme.accent }}>✓</span>}
                    </div>
                  </div>
                )}

                {/* 新規カード入力（保存カード未選択時のみ表示） */}
                {selectedCard === null && (
                  <>
                    <StripeForm
                      primaryColor={theme.primary}
                      amount={totalAmt}
                      onWalletPayment={confirmWalletPayment}
                      onReady={(stripe, card) => { stripeRef.current = stripe; cardElRef.current = card; }}
                    />
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label="Cardholder Name" value={info.cardName || info.name || currentUser?.name || ''} onChange={val => b({ info: { ...info, cardName: val } })} placeholder="Taro Yamada" />
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Test Card</label>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-400">4242 4242 4242 4242</div>
                      </div>
                    </div>
                    {currentUser && (
                      <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                        <input type="checkbox" checked={saveCardOn} onChange={e => setSaveCardOn(e.target.checked)} className="accent-purple-500 w-4 h-4" />
                        <span className="text-sm text-gray-300">{t('saveCardNext')}</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            {payError && (
              <div className="mb-3 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-sm">❌ {payError}</div>
            )}

            <div className="flex items-center gap-3 p-3 bg-gray-800/40 border border-gray-700 rounded-xl text-gray-400 text-xs">
              <span className="text-green-400 text-lg flex-shrink-0">🔒</span>
              <span>256-bit SSL · PCI DSS Level 1 · Card data processed exclusively by Stripe</span>
            </div>
          </div>
        )}

        {/* ── STEP 7 — Success ─────────────────────────────────── */}
        {step === 7 && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-white mb-2">Booking Confirmed!</h3>
            <p className="text-gray-400 text-sm mb-5">
              Your reservation is secured. Notifications sent via {(info.channels ?? ['Email']).join(', ')}.
            </p>
            <div className="bg-gray-800 rounded-xl p-4 text-left mb-5">
              {[
                ['Vehicle', isClassBased ? `${classLabel(v.targetClass ?? v.cls)} ${t('bm_omakase')}` : `${v.maker} ${v.model}`],
                ['Pickup',  pickup],
                ['Return',  ret],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between text-sm py-1">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-white">{val}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm py-1 font-bold border-t border-gray-700 mt-1 pt-2">
                <span className="text-gray-300">Total Paid</span>
                <span className="font-mono" style={{ color: theme.accent }}>
                  ¥{totalAmt.toLocaleString()}
                  {currency !== 'JPY' && <span className="text-gray-400 font-normal"> (≈ {format(totalAmt)} {currency})</span>}
                </span>
              </div>
            </div>
            {!currentUser && (
              <BookingDrivePassUpsell
                reservation={lastReservation}
                guest={{ name: info.name, email: info.email }}
                theme={theme}
              />
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={() => dispatch({ type: 'CLOSE_BOOKING' })} className="px-5 py-2 bg-gray-700 text-white rounded-xl text-sm">Close</button>
              <GradBtn theme={theme} onClick={() => { dispatch({ type: 'CLOSE_BOOKING' }); dispatch({ type: 'SET_PAGE', v: 'mypage' }); }} className="px-5 py-2 text-sm">
                View My Reservations
              </GradBtn>
            </div>
          </div>
        )}

        {/* ── Navigation — big sticky bottom action bar (app-style) ─── */}
        {step < 8 && (
          <div className="sticky bottom-0 -mx-4 mt-6 flex items-center gap-3 border-t border-gray-800 bg-gray-900/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
            {step < 7 && (
              <button
                onClick={step > 1 ? prev : () => dispatch({ type: 'CLOSE_BOOKING' })}
                className="flex-shrink-0 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3.5 text-sm font-semibold text-gray-200 active:scale-95"
              >
                ← {t('bk_back')}
              </button>
            )}
            <GradBtn
              theme={theme}
              onClick={step === 6 ? confirm : handleNext}
              disabled={(step === 1 && !step1Valid) || (step === 6 && paying)}
              className="flex-1 py-3.5 text-base font-bold active:scale-[0.98]"
            >
              {step === 6
                ? (paying ? t('bk_processing') : `🔒 ${t('bk_confirmPay')}`)
                : step === 4
                  ? `${t('bk_toInfo')} →`
                  : `${t('bk_next')} →`}
            </GradBtn>
          </div>
        )}

      </div>
    </Modal>
  );
}
