'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import LanguageSwitcher from './LanguageSwitcher';
import { grad, GradBtn } from './Shared';
import StoreAddonsEditor from './StoreAddonsEditor';
import AdminMapPicker from './AdminMapPicker';
import VehicleImageUploader from './VehicleImageUploader';
import InspectionUploader from './InspectionUploader';
import { JAPAN_AIRPORTS, VEHICLE_CLASSES } from '../lib/data';
import { INSURANCE_PLANS, PAID_PLAN_IDS, normalizeOfferedPlanIds } from '../lib/insurance';
import OneWayPublishLauncher from './oneway/OneWayPublishLauncher';
import OwnerLocationsManager from './oneway/OwnerLocationsManager';
import DamageInspection from './DamageInspection';
import CrossReturnPanel from './CrossReturnPanel';
import { RUN_OF_FLEET_CLASS_OPTIONS, classLabelJa, runOfFleetConfigOf } from '../lib/runOfFleet';
import { supabase } from '../lib/supabase';
import OwnerCalendar from './OwnerCalendar';
import OwnerRenterReviews from './OwnerRenterReviews';
import OwnerAppearanceSelector, { OwnerSkinStyles, readOwnerSkin, SKIN_OPTIONS } from './OwnerAppearance';
import RunOfFleetAssignmentPanel from './RunOfFleetAssignmentPanel';
import OwnerPickupScanner from './OwnerPickupScanner';

function Card({ children, className = '' }) {
  return <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 ${className}`}>{children}</div>;
}

// 車両検索：メーカー/車種/グレード/ナンバー/年式/クラス/場所で部分一致
export function vehicleMatches(v, q) {
  if (!q || !q.trim()) return true;
  const s = q.trim().toLowerCase();
  return [v.maker, v.model, v.grade, v.licensePlate, v.license_plate, v.year, v.cls, v.loc, v.type]
    .filter(Boolean).some(x => String(x).toLowerCase().includes(s));
}
function Badge({ text, color }) {
  const colors = {
    confirmed: 'bg-green-900/40 text-green-400 border-green-700/40',
    pending:   'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
    pending_assignment: 'bg-purple-900/60 text-purple-200 border-purple-500/60',
    assigned: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
    cancelled: 'bg-red-900/40 text-red-400 border-red-700/40',
    rejected: 'bg-red-900/40 text-red-400 border-red-700/40',
    active:    'bg-blue-900/40 text-blue-400 border-blue-700/40',
    inactive:  'bg-gray-800 text-gray-500 border-gray-700',
  };
  return <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${colors[color] ?? colors.inactive}`}>{text}</span>;
}

function OwnerDashboardTabIcon({ tab, compact = false }) {
  if (tab.id === 'best-go-oneway') {
    const size = compact ? 'h-6 w-8' : 'h-7 w-10';
    return (
      <span className={`relative inline-flex ${size} flex-shrink-0 items-center justify-center`} aria-hidden="true">
        <img src="/best-go-icon.png" alt="" className="absolute left-0 h-6 w-6 rounded-lg object-cover ring-1 ring-purple-500/40" />
        <img src="/oneway-icon.png" alt="" className="absolute right-0 h-6 w-6 rounded-lg object-cover ring-1 ring-fuchsia-500/40" />
      </span>
    );
  }
  return <span className={compact ? 'text-lg leading-none' : 'text-xl leading-none'}>{tab.icon}</span>;
}

const inp = 'bg-gray-800 border border-gray-700 text-white rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-purple-500 w-full';

const OWNER_DASHBOARD_JA_FALLBACKS = {
  owd_preBookingChat: '予約前チャット',
  od_stPending: '審査中',
  od_stApproved: '承認済み',
  owd_shopProfileRating: '店舗プロフィール評価',
  owd_lend: '貸し出す',
  owd_dontLend: '貸し出さない',
  od_rofBooth: 'お任せブース',
  od_currentStore: '表示中の店舗',
  od_switchStore: '店舗を切替',
  od_refreshStores: '店舗一覧を更新',
  od_refreshingStores: '更新中...',
  od_addStoreBtn: '＋ 店舗を追加',
  od_storeSwitchHint: '承認済み店舗が2つ以上あると、ここに店舗切替が表示されます。',
  od_pendingStoreApplications: '申請中の店舗',
};

function dashText(t, key) {
  const value = t(key);
  return value === key ? (OWNER_DASHBOARD_JA_FALLBACKS[key] ?? value) : value;
}

function inspectionStatus(expiry) {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (days < 0)  return { key: 'od_inspExpired', days, color: 'text-red-400',    icon: '🚨' };
  if (days < 30) return { key: 'od_remainDays',  days, color: 'text-orange-400', icon: '⚠️' };
  if (days < 90) return { key: 'od_remainDays',  days, color: 'text-yellow-400', icon: '⚡' };
  return           { key: 'od_remainDays',       days, color: 'text-green-400',  icon: '✅' };
}

function inspLabel(s, t) {
  if (!s) return '';
  return s.key === 'od_inspExpired' ? t('od_inspExpired') : t('od_remainDays').replace('{n}', s.days);
}

function approvalBadge(status) {
  const MAP = {
    pending:  { label: 'od_stPending', cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40' },
    approved: { label: 'od_stApproved', cls: 'bg-green-900/40 text-green-400 border-green-700/40' },
    rejected: { label: 'od_stRejected', cls: 'bg-red-900/40 text-red-400 border-red-700/40' },
  };
  return MAP[status] ?? { label: status ?? 'od_stUnknown', cls: 'bg-gray-800 text-gray-500 border-gray-700' };
}

function isPendingAssignment(r) {
  const bookingType = r.booking_type ?? r.bookingType;
  const assignmentStatus = r.assignment_status ?? r.assignmentStatus;
  const vehicleId = r.vehicle_id ?? r.vehicleId;
  return bookingType === 'class_based' && assignmentStatus === 'pending_assignment' && !vehicleId;
}

function reservationPaidAmount(r) {
  return Number(r?.stripe_paid_amount ?? r?.stripePaidAmount ?? r?.total ?? 0);
}

// 振込申請のステータス表示（色付きピル）
function PayoutStatusPill({ status, t }) {
  const map = {
    pending:  { label: t('po_statusPending'),  cls: 'bg-amber-900/30 text-amber-300 border-amber-700/40' },
    approved: { label: t('po_statusApproved'), cls: 'bg-sky-900/30 text-sky-300 border-sky-700/40' },
    paid:     { label: t('po_statusPaid'),     cls: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' },
    rejected: { label: t('po_statusRejected'), cls: 'bg-red-900/30 text-red-300 border-red-700/40' },
  };
  const s = map[status] ?? map.pending;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${s.cls}`}>{s.label}</span>;
}

function ownerChatParticipantMeta(msg, t) {
  const mine = msg.sender_role === 'owner';
  return {
    mine,
    label: mine ? 'あなた' : 'ゲスト',
    subLabel: mine ? 'You' : 'Guest',
    avatar: mine ? t('cm_avatarMe') : t('cm_avatarGuest'),
  };
}

function RenterTrustSnapshot({ stats }) {
  const { t } = useI18n();
  const reviews = stats?.recentReviews ?? [];
  const avg = stats?.avg ?? null;
  const low = Number(stats?.lowRatingCount ?? 0) > 0 || (avg != null && avg < 3);
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 ${low ? 'border-red-700/50 bg-red-950/30' : 'border-gray-800 bg-gray-950'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-white">{t('owd_renterProfileRating')}</p>
          <p className="text-[11px] text-gray-500">previous reviews from other owners</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-amber-400">{avg != null ? `★ ${Number(avg).toFixed(1)}` : '—'}</p>
          <p className="text-[11px] text-gray-500">{t('mp_reviewCountPts').replace('{n}', stats?.count ?? 0).replace('{pts}', stats?.ratingPoints ?? '—')}</p>
        </div>
      </div>
      {low && <p className="mt-1 text-[11px] font-semibold text-red-300">{t('owd_lowRatingWarning')}</p>}
      {reviews.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {reviews.slice(0, 2).map(review => (
            <div key={review.id} className="rounded-lg bg-gray-900/80 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-400">★ {review.rating} · {review.reviewerOwnerName}</span>
                <span className="text-[10px] text-gray-600">{review.createdAt?.slice(0, 10)}</span>
              </div>
              {review.comment && <p className="mt-0.5 text-[11px] text-gray-300">{String(review.comment).slice(0, 120)}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">{t('owd_noOwnerReviews')}</p>
      )}
    </div>
  );
}

function OwnerProfileReviewSummary({ profile }) {
  const { t } = useI18n();
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-white">{dashText(t, 'owd_shopProfileRating')}</p>
          <p className="mt-0.5 text-xs text-gray-500">{t('owd_shopReviewsSub')}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-amber-400">{profile?.avgRating != null ? `★ ${Number(profile.avgRating).toFixed(1)}` : '—'}</p>
          <p className="text-xs text-gray-500">{t('mp_reviewCountPts').replace('{n}', profile?.reviewCount ?? 0).replace('{pts}', profile?.ratingPoints ?? '—')}</p>
        </div>
      </div>
      {(profile?.visibleReviews ?? []).length > 0 && (
        <div className="mt-3 space-y-2">
          {profile.visibleReviews.slice(0, 3).map(review => (
            <div key={review.id} className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-amber-400">★ {review.rating}</span>
                <span className="text-[11px] text-gray-600">{review.createdAt?.slice(0, 10)}</span>
              </div>
              {review.comment && <p className="mt-1 text-xs text-gray-300">{review.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function detectLanguage(text, fallback = 'ja') {
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return fallback;
}

// ── VehicleStatusCard ─────────────────────────────────────────────
function VehicleStatusCard({ v, ownerId, ownerAuthId, onRefresh, theme, onEdit }) {
  const { t } = useI18n();
  const { dispatch } = useApp();
  const g = grad(theme);
  const s = inspectionStatus(v.inspection_expiry);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteVehicle = async () => {
    if (deleting) return;
    if (typeof window !== 'undefined' && !window.confirm(t('od_deleteConfirm'))) return;
    setDeleting(true);
    try {
      const qs = new URLSearchParams();
      if (ownerId) qs.set('ownerId', String(ownerId));
      if (ownerAuthId) qs.set('ownerAuthId', String(ownerAuthId));
      const res = await fetch(`/api/vehicles/${v.id}?${qs.toString()}`, { method: 'DELETE' });
      if (res.ok) {
        dispatch({ type: 'TOAST', msg: t('od_deleteSuccess') });
        await onRefresh?.();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.code === 'active_reservations'
          ? t('od_deleteBlockedActive')
          : t('od_deleteFailed') + ': ' + (err.error ?? res.status);
        dispatch({ type: 'TOAST', msg });
      }
    } catch (e) {
      dispatch({ type: 'TOAST', msg: t('od_deleteFailed') + ': ' + (e.message ?? '') });
    } finally { setDeleting(false); }
  };

  const toggleStatus = async () => {
    if (v.approval_status !== 'approved') return;
    setToggling(true);
    try {
      const newStatus = v.status === 'active' ? 'inactive' : 'active';
      const res = await fetch(`/api/vehicles/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        dispatch({ type: 'TOAST', msg: t('owd_toggleFailed') + ': ' + (err.error ?? res.status) });
      }
    } catch (e) {
      dispatch({ type: 'TOAST', msg: t('owd_toggleFailed') + ': ' + (e.message ?? '') });
    } finally { setToggling(false); }
  };

  const APPROVAL_CONFIG = {
    pending: {
      banner: 'border-yellow-700/60 bg-yellow-900/20',
      icon: '⏳', title: t('od_reviewingTitle'),
      msg: t('od_reviewingMsg'),
      msgColor: 'text-yellow-300',
    },
    approved: {
      banner: v.status === 'active' ? 'border-green-700/60 bg-green-900/20' : 'border-gray-700 bg-gray-800/40',
      icon: v.status === 'active' ? '✅' : '⏸',
      title: v.status === 'active' ? t('od_public') : t('od_private'),
      msg: v.status === 'active' ? t('od_publicMsg') : t('od_privateMsg'),
      msgColor: v.status === 'active' ? 'text-green-300' : 'text-gray-400',
    },
    rejected: {
      banner: 'border-red-700/60 bg-red-900/20',
      icon: '❌', title: t('od_stRejected'),
      msg: v.approval_note ? `${t('od_rejectReasonPrefix')}${v.approval_note}` : t('od_rejectedMsg'),
      msgColor: 'text-red-300',
    },
  };

  const cfg = APPROVAL_CONFIG[v.approval_status ?? 'pending'];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* 審査・公開ステータスバナー */}
      <div className={`border-b ${cfg.banner} px-4 py-3 flex items-start gap-3`}>
        <span className="text-xl flex-shrink-0 mt-0.5">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white font-semibold text-sm">{cfg.title}</span>
            {v.approval_status === 'approved' && (
              <button
                onClick={toggleStatus}
                disabled={toggling}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-50 ${
                  v.status === 'active'
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'text-white hover:opacity-90'
                }`}
                style={v.status !== 'active' ? { background: g } : {}}
              >
                {toggling ? t('od_toggling') : v.status === 'active' ? `⏸ ${t('od_makePrivate')}` : `▶ ${t('od_makePublic')}`}
              </button>
            )}
            <button
              onClick={() => onEdit?.(v)}
              className="text-xs px-3.5 py-1.5 rounded-lg font-bold border border-gray-600 text-gray-200 hover:bg-gray-700 transition-all active:scale-95"
            >
              ✏️ {t('od_edit')}
            </button>
            <button
              onClick={deleteVehicle}
              disabled={deleting}
              className="text-xs px-3.5 py-1.5 rounded-lg font-bold border border-red-700/70 text-red-300 hover:bg-red-900/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {deleting ? t('od_deleting') : `🗑 ${t('od_delete')}`}
            </button>
          </div>
          <p className={`text-xs mt-0.5 ${cfg.msgColor}`}>{cfg.msg}</p>
        </div>
      </div>

      {/* 車両情報 — tap anywhere to edit */}
      <div onClick={() => onEdit?.(v)} className="flex gap-4 p-4 cursor-pointer active:bg-gray-800/40 transition-colors">
        {v.img_url ? (
          <img src={v.img_url} alt="" className="w-28 h-24 object-cover rounded-xl flex-shrink-0 bg-gray-800" />
        ) : (
          <div className="w-28 h-24 bg-gray-800 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">🚗</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[15px] mb-0.5 truncate">{v.maker} {v.model}</p>
          <p className="text-gray-400 text-xs mb-1.5 truncate">{v.year}{t('od_yearSuffix')} · {(v.loc ?? '').split(',')[0]}</p>
          {s && (
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mb-1.5 ${s.days < 30 ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700/60 text-gray-300'}`}>
              {s.icon} {t('od_inspection')} {inspLabel(s, t)}
            </span>
          )}
          <p className="text-purple-300 text-lg font-extrabold leading-none">
            ¥{(v.price_day ?? 0).toLocaleString()}
            <span className="text-gray-500 text-xs font-normal">{t('od_perDaySlash')}</span>
          </p>
        </div>
        <span className="self-center text-gray-600 text-lg">›</span>
      </div>
    </div>
  );
}

function VehicleForm({ ownerId, ownerAuthId, onSaved, onCancel, theme, vehicle }) {
  const { t } = useI18n();
  const { dispatch } = useApp();
  const isEdit = Boolean(vehicle?.id);
  const [v, setV] = useState(() => vehicle ? {
    id: vehicle.id,
    approvalStatus: vehicle.approval_status ?? vehicle.approvalStatus ?? null,
    maker: vehicle.maker ?? '', model: vehicle.model ?? '', grade: vehicle.grade ?? '',
    loc: vehicle.loc ?? '',
    year: vehicle.year ?? new Date().getFullYear(), pax: vehicle.pax ?? 5,
    fuel: vehicle.fuel ?? 'Gasoline', trans: vehicle.trans ?? 'AT',
    largeSuitcases: vehicle.large_suitcases ?? vehicle.largeSuitcases ?? 2,
    smallBags: vehicle.small_bags ?? vehicle.smallBags ?? 2,
    priceDay: vehicle.price_day ?? vehicle.priceDay ?? 0,
    priceHour: vehicle.price_hour ?? vehicle.priceHour ?? 0,
    deposit: vehicle.deposit ?? 0, insurance: vehicle.insurance ?? 1100,
    insurancePlans: normalizeOfferedPlanIds(vehicle.insurance_plans ?? vehicle.insurancePlans),
    cls: vehicle.cls ?? 'standard', type: vehicle.type ?? 'corporate', status: vehicle.status ?? 'active',
    inspectionExpiry: vehicle.inspection_expiry ?? vehicle.inspectionExpiry ?? '',
    licensePlate: vehicle.license_plate ?? vehicle.licensePlate ?? '',
    tags: Array.isArray(vehicle.tags) ? vehicle.tags.join(', ') : (vehicle.tags ?? ''),
    img: vehicle.img_url ?? vehicle.img ?? '',
    lat: vehicle.lat ?? null, lng: vehicle.lng ?? null,
    airports: Array.isArray(vehicle.airports) ? vehicle.airports : [],
    oneWayEnabled: vehicle.one_way_enabled ?? vehicle.oneWayEnabled ?? false,
    inspectionCertUrl: vehicle.inspection_cert_url ?? vehicle.inspectionCertUrl ?? '',
    insuranceCertUrl: vehicle.insurance_cert_url ?? vehicle.insuranceCertUrl ?? '',
    badge: vehicle.badge ?? '',
  } : {
    maker: '', model: '', grade: '', loc: '',
    year: new Date().getFullYear(), pax: 5,
    fuel: 'Gasoline', trans: 'AT',
    largeSuitcases: 2, smallBags: 2,
    priceDay: 0, priceHour: 0, deposit: 0, insurance: 1100,
    insurancePlans: [...PAID_PLAN_IDS],
    cls: 'standard', type: 'corporate', status: 'active',
    inspectionExpiry: '', licensePlate: '',
    tags: '', img: '', lat: null, lng: null,
    airports: [], oneWayEnabled: false,
    inspectionCertUrl: '', insuranceCertUrl: '', badge: '',
  });
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const upd = (k, val) => setV(p => ({ ...p, [k]: val }));

  const handleSave = async () => {
    if (saving) return;
    if (!v.maker || !v.model) { setSaveError(t('od_errMakerModel')); return; }
    if (!v.priceDay || Number(v.priceDay) <= 0) { setSaveError(t('od_errPriceDay')); return; }
    if (!v.inspectionExpiry) { setSaveError(t('od_errInspExpiry')); return; }
    if (!v.inspectionCertUrl) { setSaveError(t('od_errInspCert')); return; }
    if (!v.insuranceCertUrl) { setSaveError(t('od_errInsCert')); return; }
    setSaveError('');
    setSaving(true);
    try {
      // dispatch を介さず直接APIを呼び、成功/失敗をはっきり表示する
      const payload = {
        ...v,
        id: v.id,
        tags: v.tags.split(',').map(t => t.trim()).filter(Boolean),
        priceDay: +v.priceDay, priceHour: +v.priceHour, deposit: +v.deposit,
        insurance: +v.insurance, pax: +v.pax, year: +v.year,
        insurancePlans: normalizeOfferedPlanIds(v.insurancePlans),
        largeSuitcases: +v.largeSuitcases, smallBags: +v.smallBags,
        lat: v.lat ? +v.lat : null, lng: v.lng ? +v.lng : null,
        owner_id: ownerId,
        owner_auth_id: ownerAuthId ?? null,
      };
      const res = await fetch('/api/vehicles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError((saved && saved.error) ? saved.error : t('od_errSaveFailed'));
        return;
      }
      await dispatch({ type: 'UPSERT_VEHICLE', v: { ...payload, ...saved }, persist: false });
      dispatch({ type: 'TOAST', msg: t('owd_savedPriceDay').replace('{price}', (saved.price_day ?? payload.priceDay)?.toLocaleString?.() ?? saved.price_day) });
      await onSaved?.();
    } catch (error) {
      setSaveError(error?.message ?? t('od_errSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const reqMark = <span className="text-red-400"> *</span>;
  const field = (label, key, type = 'text', extra = {}, required = false) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}{required ? reqMark : null}</label>
      <input type={type} value={v[key] ?? ''} onChange={e => upd(key, e.target.value)} className={inp} {...extra} />
    </div>
  );
  const sel = (label, key, options) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <select value={v[key]} onChange={e => upd(key, e.target.value)} className={inp}>
        {options.map(o => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}
      </select>
    </div>
  );
  const sectionHead = (emoji, label) => (
    <div className="sm:col-span-2 border-t border-gray-800 pt-4 mt-1">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{emoji} {label}</p>
    </div>
  );

  return (
    <Card className="mb-6">
      <h4 className="text-white font-bold mb-6">{isEdit ? t('od_editVehicle') : t('od_addVehicle')}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sectionHead('🚗', t('od_secBasic'))}
        {field(t('od_fMaker'), 'maker', 'text', {}, true)}{field(t('od_fModel'), 'model', 'text', {}, true)}
        {field(t('od_fGrade'), 'grade')}{field(t('od_fYear'), 'year', 'number')}
        {sel(t('od_fClass'), 'cls', (VEHICLE_CLASSES || []).filter(c => c.id !== 'all').map(c => ({ v: c.id, l: c.label })))}
        {sel(t('od_fType'), 'type', [{ v: 'corporate', l: t('od_typeCorp') }])}
        {sel(t('od_fFuel'), 'fuel', ['Gasoline','Hybrid','Electric','Diesel'])}
        {sel(t('od_fTrans'), 'trans', ['AT','MT','CVT'])}

        {sectionHead('👥', t('od_secCapacity'))}
        {field(t('od_fPax'), 'pax', 'number')}
        {field(t('od_fLargeSuitcases'), 'largeSuitcases', 'number', { min: 0 })}
        {field(t('od_fSmallBags'), 'smallBags', 'number', { min: 0 })}
        <div className="sm:col-span-2 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-xs text-purple-100">
          <p className="font-bold">{t('od_luggageGuide')}</p>
          <p>{t('od_luggageLarge')}</p>
          <p>{t('od_luggageSmall')}</p>
        </div>

        {sectionHead('💴', t('od_secPricing'))}
        {field(t('od_fPriceDay'), 'priceDay', 'number', { min: 0 }, true)}
        {field(t('od_fPriceHour'), 'priceHour', 'number')}
        {/* 旧「保険料/日」入力は廃止（保険は下部の補償プラン選択制） */}
        {field(t('od_fDeposit'), 'deposit', 'number')}

        {sectionHead('🛡', t('od_secInsurancePlans'))}
        <div className="sm:col-span-2 space-y-2">
          <p className="text-xs text-gray-400">{t('od_insPlansHint')}</p>
          <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/40 p-3 text-xs text-gray-300">
            <span className="text-green-400">✅</span><span>{t('od_insPlanBasicNote')}</span>
          </div>
          {INSURANCE_PLANS.filter(p => p.id !== 'basic').map(p => {
            const on = (v.insurancePlans ?? []).includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => upd('insurancePlans', on
                  ? (v.insurancePlans ?? []).filter(x => x !== p.id)
                  : [...(v.insurancePlans ?? []), p.id])}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${on ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white"
                    style={on ? { background: p.accent } : { background: '#374151', color: '#6b7280' }}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <div>
                    <p className="text-white text-sm font-semibold">{t(`ins_${p.id}_name`)}</p>
                    <p className="text-gray-400 text-xs">¥{p.price.toLocaleString()} {t('ins_per24h')} · {t(`ins_${p.id}_tag`)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {sectionHead('🏷', t('od_secDisplay'))}
        {sel(t('od_fStatus'), 'status', [{ v: 'active', l: t('od_stActive') }, { v: 'maintenance', l: t('od_stMaintenance') }, { v: 'inactive', l: t('od_stInactive') }])}
        {field(t('od_fBadge'), 'badge')}
        <div className="sm:col-span-2">{field(t('od_fTags'), 'tags')}</div>

        <div className="sm:col-span-2">
          <div onClick={() => upd('oneWayEnabled', !v.oneWayEnabled)}
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${v.oneWayEnabled ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'}`}>
            <div className="flex items-center gap-3">
              <span className="text-xl">↗️</span>
              <div>
                <p className="text-white text-sm font-semibold">{t('od_oneWayTitle')}</p>
                <p className="text-gray-400 text-xs">{t('od_oneWayDesc')}</p>
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-all relative ${v.oneWayEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${v.oneWayEnabled ? 'left-7' : 'left-1'}`} />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-400 mb-2">{t('od_airportsLabel')}</label>
          <div className="space-y-2">
            {(JAPAN_AIRPORTS || []).map(ap => {
              const selected = Array.isArray(v.airports) && v.airports.includes(ap.code);
              const feeKey = `airportFee_${ap.code}`;
              const feeVal = v[feeKey] ?? '';
              const toggleAirport = () => {
                const cur = Array.isArray(v.airports) ? v.airports : [];
                upd('airports', selected ? cur.filter(c => c !== ap.code) : [...cur, ap.code]);
              };
              return (
                <div key={ap.code} className={`flex flex-col gap-3 p-3 rounded-xl border transition-all sm:flex-row sm:items-center ${selected ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 bg-gray-800/30'}`}>
                  <div onClick={toggleAirport} className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-purple-500 bg-purple-600' : 'border-gray-600'}`}>
                      {selected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <span className="text-xl">{ap.emoji}</span>
                    <div className="min-w-0">
                      <span className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-400'}`}>{ap.code}</span>
                      <span className="text-gray-500 text-xs ml-1.5">{ap.city}</span>
                    </div>
                  </div>
                  {v.oneWayEnabled && selected && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 text-xs">{t('od_returnFeeLabel')}</span>
                      <input type="number" min="0" step="100" value={feeVal}
                        onChange={e => upd(feeKey, e.target.value ? Number(e.target.value) : '')}
                        placeholder="3300"
                        className="w-24 bg-gray-900 border border-gray-600 text-white rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-purple-500"
                        onClick={e => e.stopPropagation()} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {sectionHead('🖼', t('od_secPhoto'))}
        <div className="sm:col-span-2">
          <VehicleImageUploader value={v.img} onChange={({ url }) => upd('img', url)} />
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">{t('od_orImageUrl')}</label>
            <input type="text" value={v.img?.startsWith('data:') ? '' : (v.img ?? '')}
              onChange={e => upd('img', e.target.value)} placeholder="https://example.com/car.jpg" className={inp} />
          </div>
        </div>

        {sectionHead('📍', t('od_locationMap'))}
        <div className="sm:col-span-2 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('od_displayName')}</label>
            <input value={v.loc ?? ''} onChange={e => upd('loc', e.target.value)}
              placeholder={t('od_phDisplayName')} className={inp} />
          </div>
          <AdminMapPicker lat={v.lat} lng={v.lng}
            onChange={({ lat, lng, address }) => {
              if (lat !== undefined) upd('lat', lat);
              if (lng !== undefined) upd('lng', lng);
              if (address && !v.loc) upd('loc', address);
            }} />
          {!v.lat && !v.lng && (
            <div className="flex items-center gap-2 text-gray-600 text-xs bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-800">
              <span>⚠️</span> {t('od_locNotSet')}
            </div>
          )}
        </div>

        {sectionHead('🔍', t('od_inspInfo'))}
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('od_inspExpiryLabel')} <span className="text-red-400">*</span></label>
          <input type="date" value={v.inspectionExpiry ?? ''} onChange={e => upd('inspectionExpiry', e.target.value)} className={inp} />
          {v.inspectionExpiry && (() => { const s = inspectionStatus(v.inspectionExpiry); return s ? <p className={`text-xs mt-1 font-semibold ${s.color}`}>{s.icon} {inspLabel(s, t)}</p> : null; })()}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('od_licensePlate')}</label>
          <input type="text" value={v.licensePlate ?? ''} onChange={e => upd('licensePlate', e.target.value)} placeholder="品川 300 あ 1234" className={inp} />
        </div>
        <div className="sm:col-span-2">
          <InspectionUploader label={t('od_inspCertLabel')} value={v.inspectionCertUrl ?? ''}
            onChange={({ url }) => { upd('inspectionCertUrl', url); setSaveError(''); }} />
        </div>
      </div>

      <div className="mt-6 p-4 rounded-2xl border-2 border-dashed border-purple-500/40 bg-purple-500/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-purple-400 text-lg">🛡️</span>
          <span className="text-sm font-bold text-white">{t('od_insCertTitle')}</span>
          <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-lg">{t('od_required')}</span>
        </div>
        <InspectionUploader label={t('od_insCertUpload')} value={v.insuranceCertUrl ?? ''}
          onChange={({ url }) => { upd('insuranceCertUrl', url); setSaveError(''); }} />
        {!v.insuranceCertUrl && <p className="text-xs text-orange-400 mt-2">{t('od_uploadNeeded')}</p>}
        {v.insuranceCertUrl  && <p className="text-xs text-green-400 mt-2">{t('od_uploaded')}</p>}
      </div>

      {saveError && <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠️ {saveError}</div>}
      {/* Sticky action bar — big primary save, always reachable on mobile */}
      <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-gray-800 bg-gray-900/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <GradBtn theme={theme} className="flex-1 py-3.5 text-base font-bold active:scale-[0.98] disabled:opacity-60" onClick={handleSave} disabled={saving}>{saving ? t('od_saving') : `💾 ${t('od_save')}`}</GradBtn>
        <button onClick={onCancel} disabled={saving} className="text-gray-400 hover:text-white text-sm border border-gray-700 rounded-xl px-6 transition-colors active:scale-95 disabled:opacity-60">{t('od_cancel')}</button>
      </div>
    </Card>
  );
}

function RunOfFleetBoothManager({ vehicles, theme, onRefresh }) {
  const { t } = useI18n();
  const { dispatch } = useApp();
  const g = grad(theme);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries((vehicles ?? []).map(vehicle => {
      const config = runOfFleetConfigOf(vehicle);
      const fallback = RUN_OF_FLEET_CLASS_OPTIONS.find(option => option.id === config.targetClass) ?? RUN_OF_FLEET_CLASS_OPTIONS[0];
      return [vehicle.id, {
        enabled: config.enabled,
        class: config.targetClass,
        priceDay: config.priceDay || Number(vehicle.price_day ?? vehicle.priceDay ?? 0),
        location: config.location || vehicle.loc || '',
        image: config.image || fallback.image,
      }];
    })));
  }, [vehicles]);

  const setDraft = (vehicleId, patch) => {
    setDrafts(prev => ({ ...prev, [vehicleId]: { ...(prev[vehicleId] ?? {}), ...patch } }));
  };

  const save = async (vehicle) => {
    const draft = drafts[vehicle.id] ?? {};
    setError('');
    if (draft.enabled && !String(draft.location ?? '').trim()) {
      setError(t('od_errRofLoc'));
      return;
    }
    if (draft.enabled && Number(draft.priceDay ?? 0) <= 0) {
      setError(t('od_errRofPrice'));
      return;
    }

    setSavingId(vehicle.id);
    try {
      const selectedClass = RUN_OF_FLEET_CLASS_OPTIONS.find(option => option.id === draft.class) ?? RUN_OF_FLEET_CLASS_OPTIONS[0];
      const holder = { ...(vehicle.holder ?? {}), runOfFleet: {
        enabled: Boolean(draft.enabled),
        class: draft.class ?? selectedClass.id,
        priceDay: Number(draft.priceDay ?? 0),
        location: String(draft.location ?? '').trim(),
        image: draft.image || selectedClass.image,
      } };
      const res = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holder }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? t('od_errSaveFailed'));
      dispatch({ type: 'UPSERT_VEHICLE_LOCAL', v: { ...vehicle, holder } });
      await onRefresh?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const enabledCount = (vehicles ?? []).filter(vehicle => runOfFleetConfigOf(vehicle).enabled).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-white font-bold">{dashText(t, 'od_rofBooth')}</h3>
            <p className="mt-1 text-xs text-gray-400">
              {t('od_rofDesc')}
            </p>
          </div>
          <Badge text={`${enabledCount} enabled`} color={enabledCount > 0 ? 'active' : 'inactive'} />
        </div>
        {error && <div className="mt-4 rounded-xl border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>}
      </Card>

      {vehicles.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-4xl mb-3">🚗</div>
          <p className="text-gray-400 text-sm">{t('od_registerVehicleFirst')}</p>
        </Card>
      ) : (
        vehicles.map(vehicle => {
          const draft = drafts[vehicle.id] ?? {};
          const selectedClass = RUN_OF_FLEET_CLASS_OPTIONS.find(option => option.id === draft.class) ?? RUN_OF_FLEET_CLASS_OPTIONS[0];
          const isApproved = (vehicle.approval_status ?? vehicle.approvalStatus) === 'approved';
          return (
            <Card key={vehicle.id}>
              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="space-y-1.5">
                  <div className="relative overflow-hidden rounded-xl bg-gray-800">
                    <img
                      src={vehicle.img_url || vehicle.img || vehicle.image_url || vehicle.imageUrl || selectedClass.image}
                      alt={`${vehicle.maker ?? ''} ${vehicle.model ?? ''}`}
                      className="h-44 w-full object-cover lg:h-52"
                      onError={(e) => { e.currentTarget.src = selectedClass.image; }}
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white">
                      {t('od_rofRealPhoto')}
                    </span>
                  </div>
                  <p className="text-center text-[10px] leading-tight text-gray-500">{t('od_rofRealPhotoHint')}</p>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-bold">{vehicle.maker} {vehicle.model}</p>
                      <p className="text-xs text-gray-500">{vehicle.year}{t('od_yearSuffix')} · {vehicle.loc || t('od_locUnset')}</p>
                    </div>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      draft.enabled ? 'border-purple-500 bg-purple-900/30 text-purple-100' : 'border-gray-700 text-gray-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.enabled)}
                        onChange={e => setDraft(vehicle.id, { enabled: e.target.checked })}
                        className="accent-purple-500"
                      />
                      {t('od_rofPublish')}
                    </label>
                  </div>

                  {!isApproved && (
                    <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
                      {t('od_rofAfterApproval')}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">{t('od_category')}</label>
                      <select
                        value={draft.class ?? 'standard'}
                        onChange={e => {
                          const option = RUN_OF_FLEET_CLASS_OPTIONS.find(item => item.id === e.target.value);
                          setDraft(vehicle.id, { class: e.target.value, image: option?.image });
                        }}
                        className={inp}
                      >
                        {RUN_OF_FLEET_CLASS_OPTIONS.map(option => (
                          <option key={option.id} value={option.id}>{option.labelJa}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">{t('od_rofPrice')}</label>
                      <input
                        type="number"
                        min="0"
                        value={draft.priceDay ?? ''}
                        onChange={e => setDraft(vehicle.id, { priceDay: e.target.value })}
                        className={inp}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">{t('od_carLocation')}</label>
                      <input
                        value={draft.location ?? ''}
                        onChange={e => setDraft(vehicle.id, { location: e.target.value })}
                        placeholder={t('od_phCarLocation')}
                        className={inp}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-400">{t('od_categoryImage')}</label>
                    <p className="mb-2 text-[11px] text-purple-300">{t('od_rofPublicImageHint')}</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {RUN_OF_FLEET_CLASS_OPTIONS.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setDraft(vehicle.id, { image: option.image, class: option.id })}
                          className={`overflow-hidden rounded-xl border text-left transition-all ${
                            draft.image === option.image ? 'border-purple-500 ring-2 ring-purple-500/40' : 'border-gray-700 hover:border-gray-500'
                          }`}
                        >
                          <img src={option.image} alt={option.labelJa} className="h-16 w-full object-cover" />
                          <span className="block px-2 py-1.5 text-xs font-semibold text-gray-300">{option.labelJa}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => save(vehicle)}
                      disabled={savingId === vehicle.id}
                      className="rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: g }}
                    >
                      {savingId === vehicle.id ? t('od_saving') : t('od_save')}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}


// ── OwnerChatInbox ─────────────────────────────────────────────────
function OwnerChatInbox({ ownerUserId, vehicles, theme }) {
  const { t } = useI18n();
  const g = grad(theme);
  const [conversations, setConversations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [activeConv,    setActiveConv]    = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [showOriginal,  setShowOriginal]  = useState({});
  const bottomRef = useRef(null);
  // 設定から言語・翻訳ON/OFFを読む
  const targetLang   = typeof window !== 'undefined' ? (localStorage.getItem(`owner_lang_${ownerUserId}`) ?? 'ja') : 'ja';
  const autoTranslate = typeof window !== 'undefined' ? localStorage.getItem(`owner_autotrans_${ownerUserId}`) !== 'false' : true;

  // useRef はコンポーネントスコープで使う
  const subRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!ownerUserId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/chat?userId=${ownerUserId}&role=owner`);
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch { setConversations([]); }
    finally { setLoading(false); }
  }, [ownerUserId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    const res  = await fetch(`/api/chat/${convId}?targetLang=${targetLang}`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (!activeConv?.id) return;
    loadMessages(activeConv.id);

    if (subRef.current) supabase.removeChannel(subRef.current);
    const ch = supabase
      .channel(`owner-chat:${activeConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConv.id}` }, async (p) => {
        const m = p.new;
        if (m.sender_id === ownerUserId) return;
        let translated = null;
        if (autoTranslate && m.detected_lang && m.detected_lang !== targetLang) {
          try {
            const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: m.content, targetLang, sourceLang: m.detected_lang }) });
            translated = (await r.json()).translated;
          } catch {}
        }
        setMessages(prev => [...prev, { ...m, translated_content: translated, is_translated: !!translated }]);
      })
      .subscribe();
    subRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [activeConv?.id, ownerUserId, loadMessages]);

  // アクティブ会話外の新着もブロードキャストで受信
  useEffect(() => {
    if (!ownerUserId) return;
    const ch2 = supabase
      .channel(`notify:${ownerUserId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const cid = payload.payload?.conversationId;
        if (cid && cid !== activeConv?.id) {
          // 別の会話への新着 → 会話リストを更新
          loadConversations();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch2); };
  }, [ownerUserId, activeConv?.id, loadConversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !activeConv?.id || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    const detectedLang = detectLanguage(text, targetLang);
    const optimistic = { id: `opt-${Date.now()}`, conversation_id: activeConv.id, sender_id: ownerUserId, sender_role: 'owner', content: text, detected_lang: detectedLang, translated_content: null, is_translated: false, created_at: new Date().toISOString() };
    setMessages(p => [...p, optimistic]);
    try {
      await fetch(`/api/chat/${activeConv.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senderId: ownerUserId, senderRole: 'owner', content: text, detectedLang }) });
    } catch {} finally { setSending(false); }
  };

  if (activeConv) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setActiveConv(null); setMessages([]); }} className="text-gray-400 hover:text-white text-sm">{t('od_back')}</button>
          <div>
            <p className="text-white font-semibold text-sm">{activeConv.vehicle?.maker} {activeConv.vehicle?.model}</p>
            <p className="text-gray-500 text-xs flex items-center gap-1"><span className="text-green-400">●</span> {t('od_autoTransOn')}</p>
          </div>
        </div>
        <div className="h-72 overflow-y-auto space-y-3 mb-4 border border-gray-800 rounded-xl p-3 bg-gray-950">
          {messages.map(m => {
            const meta = ownerChatParticipantMeta(m, t);
            const mine = meta.mine;
            const roleLabel = meta.label;
            const showOrig = showOriginal[m.id];
            const disp = (m.is_translated && !showOrig) ? m.translated_content : m.content;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-black text-sky-200 ring-1 ring-slate-700">
                    {meta.avatar}
                  </div>
                )}
                <div className={`max-w-[75%] flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className={`text-[11px] font-black ${mine ? 'text-purple-200' : 'text-sky-200'}`}>{roleLabel}</span>
                    <span className="text-[10px] font-semibold text-gray-600">{meta.subLabel}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl text-sm ${mine ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>{disp}</div>
                  <div className={`flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className="text-gray-600 text-xs">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.is_translated && <button onClick={() => setShowOriginal(p => ({ ...p, [m.id]: !showOrig }))} className="text-xs text-purple-400 hover:text-purple-300">{showOrig ? t('od_showTranslated') : t('od_showOriginal')}</button>}
                  </div>
                </div>
                {mine && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-black text-white ring-2 ring-purple-400/30">
                    {meta.avatar}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={t('od_phReply')} className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
          <button onClick={send} disabled={!input.trim() || sending}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: g }}>
            {sending ? '…' : t('od_send')}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-white font-bold mb-4">{t('od_chatInbox')}</h3>
      {loading ? <p className="text-gray-500 text-sm text-center py-8">{t('od_loading')}</p>
      : conversations.length === 0 ? (
        <div className="text-center py-10"><div className="text-4xl mb-3">💬</div><p className="text-gray-400 text-sm">{t('od_noMessages')}</p></div>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => {
            const lastMsg = c.messages?.[c.messages.length - 1];
            return (
              <button key={c.id} onClick={() => {
                setActiveConv(c);
                // 既読化
                fetch(`/api/chat/${c.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ readerId: ownerUserId }),
                }).catch(() => {});
              }} className="w-full flex items-center gap-3 p-3 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 rounded-xl text-left transition-all">
                {c.vehicle?.img_url ? <img src={c.vehicle.img_url} alt="" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" /> : <div className="w-12 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-xl flex-shrink-0">🚗</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{c.vehicle?.maker} {c.vehicle?.model}</p>
                  {lastMsg && <p className="text-gray-400 text-xs truncate">{lastMsg.content}</p>}
                </div>
                <span className="text-gray-600 text-xs flex-shrink-0">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function VehicleAssignmentModal({ reservation, ownerId, currentUserId, theme, onClose, onAssigned }) {
  const { t } = useI18n();
  const g = grad(theme);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reservation?.id) return;
    setLoading(true);
    setError('');
    fetch(`/api/owner/reservations/${reservation.id}/available-vehicles?ownerId=${ownerId}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || t('od_errFetchCandidates'));
        setVehicles(Array.isArray(data.availableVehicles) ? data.availableVehicles : []);
      })
      .catch(err => setError(err.message || t('od_errFetchCandidates')))
      .finally(() => setLoading(false));
  }, [reservation?.id, ownerId]);

  const assign = async () => {
    if (!selectedVehicleId) { setError(t('od_errSelectVehicle')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/owner/reservations/${reservation.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId, ownerId, assignedBy: currentUserId ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('od_errAssignFailed'));
      onAssigned(data);
    } catch (err) {
      setError(err.message || t('od_errAssignFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!reservation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-purple-100 bg-purple-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-purple-600">Action Required</p>
              <h3 className="text-lg font-black text-gray-950">Assign Vehicle</h3>
              <p className="text-sm text-gray-500">{reservation.id} · {reservation.pickup_at?.slice(0, 16)} → {reservation.return_at?.slice(0, 16)}</p>
            </div>
            <button onClick={onClose} className="rounded-lg border border-purple-100 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-white">Close</button>
          </div>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-500">{t('od_searchingCandidates')}</p>
          ) : vehicles.length === 0 ? (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-sm text-purple-800">
              {t('od_noCandidates')}
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.map(v => {
                const active = String(selectedVehicleId) === String(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicleId(v.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${active ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      {v.img_url ? <img src={v.img_url} alt="" className="h-14 w-20 rounded-lg object-cover" /> : <div className="h-14 w-20 rounded-lg bg-gray-100" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-950">{v.maker} {v.model}</p>
                        <p className="text-xs text-gray-500">{v.year} · {v.grade} · {v.cls}{v.license_plate ? ` · ${v.license_plate}` : ''}</p>
                      </div>
                      <span className={`h-5 w-5 rounded-full border ${active ? 'border-purple-600 bg-purple-600' : 'border-gray-300'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={assign} disabled={saving || !selectedVehicleId} className="rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: g }}>
              {saving ? 'Saving...' : 'Save Assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function OwnerDashboard() {
  const { state, dispatch } = useApp();
  const { t, locale } = useI18n();
  const { currentUser, theme } = state;
  const g = grad(theme);
  const [owner, setOwner]               = useState(null);
  const [owners, setOwners]             = useState([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(true);
  const [ownersRefreshing, setOwnersRefreshing] = useState(false);
  // Owner tab lives in shared state so the bottom nav can drive it too.
  const tab = state.ownerTab ?? 'today';
  const setTab = (v) => dispatch({ type: 'SET_OWNER_TAB', v });
  const [vehicles, setVehicles]         = useState([]);
  const [reservations, setReservations] = useState([]);
  const [dataLoading, setDataLoading]   = useState(false);
  const [showAddForm,  setShowAddForm]   = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [assigningReservation, setAssigningReservation] = useState(null);
  const [inspectingReservation, setInspectingReservation] = useState(null);
  const [vehQuery, setVehQuery] = useState('');
  const [ownerSkin, setOwnerSkin] = useState('light');
  const [renterReviewData, setRenterReviewData] = useState({ renterStats: {} });
  const [ownerReviewProfile, setOwnerReviewProfile] = useState(null);
  const [decisioning, setDecisioning] = useState(null);
  useEffect(() => { setOwnerSkin(readOwnerSkin()); }, []);
  const changeSkin = (s) => { setOwnerSkin(s); try { window.localStorage.setItem('bcr:ownerSkin', s); } catch (_) {} };

  // 振込申請（payout）
  const [payouts, setPayouts]                 = useState([]);
  const [payoutReserved, setPayoutReserved]   = useState(0);
  const [payoutAmount, setPayoutAmount]       = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutMsg, setPayoutMsg]             = useState('');

  const loadOwners = useCallback(async ({ showLoading = true } = {}) => {
    if (!currentUser?.id) {
      setOwners([]);
      setOwner(null);
      setSelectedOwnerId('');
      return;
    }
    if (showLoading) setOwnerLoading(true);
    else setOwnersRefreshing(true);
    const ownerLookupParams = new URLSearchParams({ userId: currentUser.id });
    if (currentUser.email) ownerLookupParams.set('email', currentUser.email);
    ownerLookupParams.set('includeAll', '1');

    try {
      const res = await fetch(`/api/owners/me?${ownerLookupParams.toString()}&_=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const ownerList = Array.isArray(data?.owners)
        ? data.owners
        : (data?.owner ? [data.owner] : (data ? [data] : []));
      const approvedOwnerList = ownerList.filter(candidate => candidate?.status === 'approved');
      const activeOwner = approvedOwnerList.find(candidate => String(candidate.id) === String(selectedOwnerId))
        ?? data?.owner
        ?? approvedOwnerList[0]
        ?? ownerList[0]
        ?? null;
      setOwners(ownerList);
      setOwner(activeOwner);
      setSelectedOwnerId(activeOwner?.id ?? '');
    } catch (_) {
      setOwners([]);
      setOwner(null);
      setSelectedOwnerId('');
    } finally {
      if (showLoading) setOwnerLoading(false);
      else setOwnersRefreshing(false);
    }
  }, [currentUser?.id, currentUser?.email, selectedOwnerId]);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const refreshVisibleOwners = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadOwners({ showLoading: false });
    };
    window.addEventListener('focus', refreshVisibleOwners);
    document.addEventListener('visibilitychange', refreshVisibleOwners);
    return () => {
      window.removeEventListener('focus', refreshVisibleOwners);
      document.removeEventListener('visibilitychange', refreshVisibleOwners);
    };
  }, [currentUser?.id, loadOwners]);

  const approvedOwners = owners.filter(candidate => candidate?.status === 'approved');
  const pendingStoreApplications = owners.filter(candidate => (
    candidate?.status === 'pending' && candidate?.business_type === 'additional_store'
  ));

  const switchOwner = (ownerId) => {
    const nextOwner = approvedOwners.find(candidate => String(candidate.id) === String(ownerId)) ?? null;
    setSelectedOwnerId(ownerId);
    setOwner(nextOwner);
    setVehicles([]);
    setReservations([]);
    setPayouts([]);
    setPayoutReserved(0);
    setShowAddForm(false);
    setEditingVehicle(null);
  };

  const loadData = useCallback(async () => {
    if (!owner?.id) return;
    setDataLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch(`/api/owner/vehicles?ownerId=${owner.id}&userId=${currentUser?.id ?? ''}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/owner/reservations?ownerId=${owner.id}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
      ]);
      setVehicles(Array.isArray(vRes) ? vRes : []);
      if (Array.isArray(rRes)) {
        setReservations(rRes);
      } else {
        console.error('[OwnerDashboard] reservations API error:', JSON.stringify(rRes));
        setReservations([]);
      }
    } catch (e) {
      console.error('[OwnerDashboard] loadData failed:', e.message);
    } finally { setDataLoading(false); }
  }, [owner?.id, currentUser?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadPayouts = useCallback(async () => {
    if (!owner?.id) return;
    try {
      const res = await fetch(`/api/owners/payouts?ownerId=${owner.id}&_=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      setPayouts(Array.isArray(json?.payouts) ? json.payouts : []);
      setPayoutReserved(Number(json?.reserved || 0));
    } catch { /* ignore — payout panel just stays empty */ }
  }, [owner?.id]);
  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const loadTrustData = useCallback(async () => {
    if (!owner?.id) return;
    try {
      const [renterRes, ownerReviewRes] = await Promise.all([
        fetch(`/api/owner/renter-reviews?ownerId=${owner.id}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/reviews?ownerId=${owner.id}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (!renterRes?.error) setRenterReviewData(renterRes ?? { renterStats: {} });
      if (!ownerReviewRes?.error) setOwnerReviewProfile(ownerReviewRes ?? null);
    } catch {
      setRenterReviewData({ renterStats: {} });
    }
  }, [owner?.id]);

  useEffect(() => { loadTrustData(); }, [loadTrustData, reservations.length]);

  const decideReservation = async (reservation, action) => {
    const reservationId = reservation?.id;
    if (!reservationId || !owner?.id) return;
    const reason = action === 'reject'
      ? (window.prompt(t('owd_rejectReasonPrompt')) ?? '')
      : '';
    if (action === 'reject' && !window.confirm(t('owd_rejectConfirm'))) return;

    setDecisioning(`${reservationId}:${action}`);
    try {
      const res = await fetch(`/api/owner/reservations/${encodeURIComponent(reservationId)}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: owner.id, action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? t('owd_decisionFailed'));
      const next = json.reservation ?? json;
      setReservations(prev => prev.map(r => String(r.id) === String(reservationId) ? { ...r, ...next } : r));
      dispatch({ type: 'TOAST', msg: action === 'approve' ? t('owd_approvedToast') : t('owd_rejectedToast'), persist: false });
      await loadTrustData();
    } catch (e) {
      dispatch({ type: 'TOAST', msg: e.message, persist: false });
    } finally {
      setDecisioning(null);
    }
  };

  // ── Supabase Broadcast でリアルタイム通知を受信 ──────────────────
  // トーストをタップした時に該当タブを開くためのグローバルフック
  useEffect(() => {
    window.__openOwnerChat = () => { setTab('chat'); setUnreadCount(0); };
    window.__openOwnerReservations = () => { setTab('reservations'); };
    return () => {
      delete window.__openOwnerChat;
      delete window.__openOwnerReservations;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;

    const ch = supabase
      .channel(`notify:${currentUser.id}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        // 未読数を増やす
        setUnreadCount(prev => prev + 1);
        // 会話リストを再取得
        loadData();
        // アプリ内トースト（OS通知が無効でも気づける）— タップでチャットタブを開く
        dispatch({ type: 'TOAST', msg: `${t('od_newMsgToastPrefix')}${payload.payload?.content ?? ''}`, action: { kind: 'ownerChat' } });
        // ブラウザ通知
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(t('od_newMsgTitle'), {
            body: payload.payload?.content ?? t('od_msgArrived'),
            icon: '/favicon.ico',
          });
        }
      })
      .on('broadcast', { event: 'new_review' }, (payload) => {
        const message = payload?.payload?.message ?? t('fa_reviewNotif');
        loadTrustData();
        dispatch({ type: 'TOAST', msg: message, action: { kind: 'ownerReviews' } });
      })
      .on('broadcast', { event: 'new_reservation' }, (payload) => {
        const payloadOwnerId = payload?.payload?.ownerId;
        const storeName = payload?.payload?.storeName ?? owner?.store_name ?? '店舗';
        const message = payload?.payload?.message ?? `${storeName}に新しい予約が入りました`;
        if (!payloadOwnerId || String(payloadOwnerId) === String(owner?.id)) {
          loadData();
        }
        dispatch({ type: 'TOAST', msg: message, action: { kind: 'ownerReservations' } });
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('新しい予約', {
            body: message,
            icon: '/favicon.ico',
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [currentUser?.id, owner?.id, owner?.store_name, loadData, loadTrustData]);

  // 未読数ポーリング（30秒ごと）+ ブラウザ通知許可リクエスト
  useEffect(() => {
    if (!currentUser?.id || owner?.status !== 'approved') return;

    // ブラウザ通知の許可をリクエスト
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const fetchUnread = async () => {
      try {
        const res  = await fetch(`/api/chat/unread?userId=${currentUser.id}&role=owner`);
        const data = await res.json();
        const newCount = data.count ?? 0;
        // 未読が増えたらブラウザ通知
        if (newCount > unreadCount && unreadCount >= 0 && Notification.permission === 'granted') {
          new Notification(t('od_newMsgsTitle'), {
            body: `${newCount}${t('od_unreadCountSuffix')}`,
            icon: '/favicon.ico',
          });
        }
        setUnreadCount(newCount);
      } catch {}
    };

    fetchUnread();
    const timer = setInterval(fetchUnread, 30000);
    return () => clearInterval(timer);
  }, [currentUser?.id, owner?.status, unreadCount]);

  const confirmedRes  = reservations.filter(r => r.status === 'confirmed');
  const pendingAssignments = reservations.filter(isPendingAssignment);
  const totalRevenue  = confirmedRes.reduce((s, r) => s + reservationPaidAmount(r), 0);

  // ── 出金可能残高（振込申請用）───────────────────────────────
  // 確定売上からプラットフォーム手数料を引いた純額 − 申請済み(未却下)。
  const platformFeePercent = Number(owner?.platform_fee_percent ?? 15);
  const netRevenue     = Math.max(0, Math.round(totalRevenue * (1 - platformFeePercent / 100)));
  const payoutAvailable = Math.max(0, netRevenue - Number(payoutReserved || 0));
  const hasBankAccount = Boolean(owner?.bank_account_number && owner?.bank_name);

  const goRegisterBank = () => {
    setTab('settings');
    // 設定タブに切り替わったあと、銀行口座カードまでスクロールして直感的に誘導。
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        document.getElementById('owner-bank-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  const submitPayout = async () => {
    setPayoutMsg('');
    if (!hasBankAccount) { goRegisterBank(); return; }
    const amount = Math.floor(Number(payoutAmount));
    if (!Number.isFinite(amount) || amount <= 0) { setPayoutMsg(t('po_errAmount')); return; }
    if (amount > payoutAvailable) { setPayoutMsg(t('po_errExceeds')); return; }
    setPayoutSubmitting(true);
    try {
      const res = await fetch('/api/owners/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: owner.id,
          amount,
          requestedBy: currentUser?.id ?? null,
          availableSnapshot: payoutAvailable,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const code = json?.code;
        if (code === 'NO_BANK') { goRegisterBank(); return; }
        if (code === 'EXISTING_PENDING') { setPayoutMsg(t('po_errExisting')); return; }
        if (code === 'EXCEEDS' || code === 'INVALID_AMOUNT') { setPayoutMsg(t('po_errExceeds')); return; }
        throw new Error(json?.error ?? t('po_errAmount'));
      }
      setPayoutAmount('');
      setPayoutMsg(t('po_requested'));
      dispatch({ type: 'TOAST', msg: t('po_requested') });
      loadPayouts();
    } catch (e) {
      setPayoutMsg(e.message);
    } finally {
      setPayoutSubmitting(false);
    }
  };

  const reservationDateOf = (r) => r.pickup_at ?? r.pickup ?? r.created_at ?? r.createdAt ?? null;
  const now = new Date();
  const monthRevenue  = confirmedRes
    .filter(r => {
      const date = reservationDateOf(r) ? new Date(reservationDateOf(r)) : null;
      return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((s, r) => s + reservationPaidAmount(r), 0);
  const expiringVehicles = vehicles.filter(v => { if (!v.inspection_expiry) return false; return Math.ceil((new Date(v.inspection_expiry) - new Date()) / 86400000) < 90; });

  // Pickups happening in the next 7 days — the owner's most time-sensitive view.
  const upcomingPickups = reservations
    .filter(r => {
      if (['cancelled', 'canceled', 'rejected'].includes(String(r.status ?? '').toLowerCase())) return false;
      const p = r.pickup_at ?? r.pickup;
      if (!p) return false;
      const days = (new Date(p) - now) / 86400000;
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => new Date(a.pickup_at ?? a.pickup) - new Date(b.pickup_at ?? b.pickup))
    .slice(0, 5);

  // ── Host overview data (Airbnb-style earnings & insights) ──────────────────
  const monthlySeries = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return confirmedRes
      .filter(r => {
        const rd = reservationDateOf(r) ? new Date(reservationDateOf(r)) : null;
        return rd && rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
      })
      .reduce((s, r) => s + reservationPaidAmount(r), 0);
  });
  const maxMonthly = Math.max(1, ...monthlySeries);
  const ratedVehicles = vehicles.filter(v => Number(v.rating) > 0);
  const avgRating = ratedVehicles.length
    ? ratedVehicles.reduce((s, v) => s + Number(v.rating), 0) / ratedVehicles.length
    : 0;
  const totalReviews = vehicles.reduce((s, v) => s + (Number(v.reviews) || 0), 0);
  const vehImg = (v) => v.img_url ?? v.img ?? v.image_url ?? v.imageUrl ?? (Array.isArray(v.photos) ? v.photos[0] : null) ?? (Array.isArray(v.images) ? v.images[0] : null);
  const thumbs = vehicles.map(vehImg).filter(Boolean).slice(0, 3);

  if (ownerLoading) return <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center"><div className="text-gray-500">{t('od_loading')}</div></div>;

  if (!owner) return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🏪</div>
        <h2 className="text-gray-900 text-xl font-bold mb-2">{t('od_registerNeeded')}</h2>
        <p className="text-gray-500 text-sm mb-6">{t('od_registerDesc')}</p>
        <button onClick={() => dispatch({ type: 'SET_PAGE', v: 'owner-register' })}
          className="px-6 py-3 rounded-xl text-white font-semibold text-sm" style={{ background: g }}>{t('od_registerCta')}</button>
      </div>
    </div>
  );

  if (owner.status === 'pending') return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="text-center max-w-sm"><div className="text-5xl mb-4">⏳</div><h2 className="text-gray-900 text-xl font-bold mb-2">{t('od_reviewing')}</h2><p className="text-gray-500 text-sm">{t('od_reviewingDesc')}</p></div>
    </div>
  );

  if (owner.status === 'rejected') return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="text-center max-w-sm"><div className="text-5xl mb-4">❌</div><h2 className="text-gray-900 text-xl font-bold mb-2">{t('od_appRejected')}</h2>{owner.rejection_reason && <p className="text-gray-500 text-sm mb-4">{t('od_reasonPrefix')}{owner.rejection_reason}</p>}</div>
    </div>
  );

  const chatLabel = unreadCount > 0
    ? `💬 ${t('ownerTabChat')} (${unreadCount})`
    : `💬 ${t('ownerTabChat')}`;
  const reservationLabel = pendingAssignments.length > 0
    ? `📋 ${t('ownerTabReservations')} (${pendingAssignments.length})`
    : `📋 ${t('ownerTabReservations')}`;
  const TABS = [
    { id: 'vehicles',     icon: '🚗', label: t('ownerTabVehicles') },
    { id: 'reservations', icon: '📋', label: t('ownerTabReservations'), badge: pendingAssignments.length },
    { id: 'calendar',     icon: '📅', label: t('ownerTabCalendar') },
    { id: 'pickup',       icon: '🪪', label: t('ownerTabPickup') },
    { id: 'chat',         icon: '💬', label: t('ownerTabChat'), badge: unreadCount },
    { id: 'revenue',      icon: '💴', label: t('ownerTabRevenue') },
    { id: 'renters',      icon: '👥', label: t('o_tabRenters') },
    { id: 'run-of-fleet', icon: '🧩', label: t('ownerTabRunOfFleet') },
    { id: 'addons',       icon: '🛒', label: t('ownerTabAddons') },
    { id: 'best-go-oneway', icon: 'GO', label: t('ownerTabBestGoOneWay') },
    { id: 'settings',     icon: '⚙️', label: t('ownerTabSettings') },
  ];

  // Bottom-nav primaries; everything else is reached from the Menu screen.
  const PRIMARY_TABS = ['today', 'calendar', 'vehicles', 'chat', 'menu'];
  const SECTION_TITLE = {
    today:         t('od_today'),
    menu:          t('od_menu'),
    vehicles:      t('ownerTabVehicles'),
    calendar:      t('ownerTabCalendar'),
    chat:          t('ownerTabChat'),
    reservations:  t('ownerTabReservations'),
    revenue:       t('ownerTabRevenue'),
    renters:       t('o_tabRenters'),
    'run-of-fleet': t('ownerTabRunOfFleet'),
    addons:        t('ownerTabAddons'),
    'best-go-oneway': t('ownerTabBestGoOneWay'),
    pickup:        t('ownerTabPickup'),
    settings:      t('ownerTabSettings'),
  };
  // Items listed on the Menu screen (exclude the bottom-nav primaries).
  const menuItems = TABS.filter(tb => !PRIMARY_TABS.includes(tb.id));

  return (
    <div className={`owner-skin owner-skin-${ownerSkin} min-h-screen bg-gray-950 px-4 pt-appbar pb-app-nav sm:px-6`}>
      <OwnerSkinStyles />
      <div className="max-w-5xl mx-auto">
        <div className="mb-5 hidden overflow-x-auto pb-1 md:flex">
          <div className="flex min-w-max gap-2">
            {TABS.map(tb => (
              <button
                key={tb.id}
                onClick={() => { setTab(tb.id); if (tb.id === 'chat') setUnreadCount(0); }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  tab === tb.id ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
                }`}
              >
                <OwnerDashboardTabIcon tab={tb} compact />
                <span>{tb.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            {!PRIMARY_TABS.includes(tab) && (
              <button
                onClick={() => setTab('menu')}
                className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                ‹ {t('od_menu')}
              </button>
            )}
            <h1 className="text-[26px] font-extrabold leading-tight text-white">{SECTION_TITLE[tab] ?? owner.store_name}</h1>
            <div className="mt-3 flex w-full flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/80 p-3 sm:max-w-3xl">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-wide text-purple-300">{t('od_currentStore')}</p>
                  <p className="truncate text-sm font-black text-white">{owner.store_name}</p>
                  {owner.store_location && <p className="truncate text-xs text-gray-500">{owner.store_location}</p>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {approvedOwners.length > 1 && (
                    <select
                      aria-label={t('od_switchStore')}
                      value={selectedOwnerId}
                      onChange={e => switchOwner(e.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-semibold text-white focus:border-purple-500 focus:outline-none sm:w-64"
                    >
                      {approvedOwners.map(candidate => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.store_name} / {candidate.store_location}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => loadOwners({ showLoading: false })}
                    disabled={ownersRefreshing}
                    className="rounded-xl border border-gray-700 px-3 py-2 text-sm font-bold text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    {ownersRefreshing ? t('od_refreshingStores') : t('od_refreshStores')}
                  </button>
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_PAGE', v: 'owner-register', ownerOnboardingMode: 'store', ownerOnboardingParentOwnerId: owner.id });
                      window.scrollTo(0, 0);
                    }}
                    className="rounded-xl border border-purple-500/40 px-3 py-2 text-sm font-bold text-purple-100 transition-colors hover:bg-purple-900/40"
                  >
                    {t('od_addStoreBtn')}
                  </button>
                </div>
              </div>
              {(approvedOwners.length <= 1 || pendingStoreApplications.length > 0) && (
                <div className="border-t border-gray-800 pt-3 text-xs text-gray-400">
                  {approvedOwners.length <= 1 && <p>{t('od_storeSwitchHint')}</p>}
                  {pendingStoreApplications.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="font-bold text-purple-200">{t('od_pendingStoreApplications')}</p>
                      {pendingStoreApplications.map(candidate => (
                        <div key={candidate.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-200">{candidate.store_name}</span>
                          <span className="text-gray-500">{candidate.store_location}</span>
                          <span className="rounded-full border border-yellow-700/40 bg-yellow-900/30 px-2 py-0.5 text-[11px] font-bold text-yellow-300">{t('od_reviewing')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <LanguageSwitcher />
            <OwnerAppearanceSelector skin={ownerSkin} onChange={changeSkin} />
          </div>
        </div>

        {tab === 'today' && (<>
        {/* Earnings + insights cards (Airbnb host style) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <button onClick={() => setTab('revenue')} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left">
            <p className="text-white font-bold text-[15px]">{t('ownerTabRevenue')}</p>
            <p className="text-gray-500 text-xs mt-0.5">{t('od_statMonthRevenue')} ¥{monthRevenue.toLocaleString()}</p>
            <div className="mt-5 flex items-end gap-1.5 h-16">
              {monthlySeries.map((val, i) => (
                <div key={i} className="flex-1 rounded-md" style={{
                  height: `${Math.max(6, (val / maxMonthly) * 100)}%`,
                  background: i === monthlySeries.length - 1 ? '#FF385C' : '#f0c2ce',
                }} />
              ))}
            </div>
          </button>
          <button onClick={() => setTab('renters')} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left">
            <p className="text-white font-bold text-[15px]">{t('od_insights')}</p>
            <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
              <span className="text-amber-400">★</span>
              <span className="text-gray-700 font-semibold">{avgRating > 0 ? avgRating.toFixed(2) : '—'}</span>
              <span>· {totalReviews}{t('od_reviewsSuffix')}</span>
            </p>
            <div className="mt-5 flex items-center gap-2">
              {thumbs.length > 0 ? thumbs.map((src, i) => (
                <img key={i} src={src} alt="" className="h-14 w-14 rounded-xl object-cover bg-gray-100" />
              )) : (
                <div className="h-14 w-full rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">{t('od_noVehiclesYet')}</div>
              )}
              {vehicles.length > thumbs.length && (
                <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-semibold">+{vehicles.length - thumbs.length}</div>
              )}
            </div>
          </button>
        </div>

        {expiringVehicles.length > 0 && (
          <div className="mb-5 bg-orange-900/30 border border-orange-700 rounded-2xl p-4">
            <p className="text-orange-300 font-semibold text-sm mb-2">{t('od_inspSoonWarn')}</p>
            <div className="space-y-1">
              {expiringVehicles.map(v => { const s = inspectionStatus(v.inspection_expiry); return <p key={v.id} className="text-xs text-orange-200">{s?.icon} {v.maker} {v.model} — {t('od_deadline')}: {v.inspection_expiry} <span className={s?.color}>({inspLabel(s, t)})</span></p>; })}
            </div>
          </div>
        )}

        {pendingAssignments.length > 0 && (
          <div className="mb-5 rounded-2xl border border-purple-500/50 bg-purple-950/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-purple-100">Action Required</p>
                <p className="text-xs text-purple-300">{t('od_pendingAssignMsg')}</p>
              </div>
              <Badge text={`${pendingAssignments.length} pending`} color="pending_assignment" />
            </div>
            <div className="space-y-2">
              {pendingAssignments.slice(0, 3).map(r => (
                <button
                  key={r.id}
                  onClick={() => setAssigningReservation(r)}
                  className="w-full rounded-xl border border-purple-500/30 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-purple-400"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-950">{r.id}</p>
                      <p className="text-xs text-gray-500">{classLabelJa(r.target_class ?? r.targetClass ?? 'standard')} · {r.pickup_at?.slice(0, 16)} → {r.return_at?.slice(0, 16)}</p>
                    </div>
                    <span className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">Assign Vehicle</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[{ label: t('od_statVehicles'), value: vehicles.length, icon: '🚗' }, { label: t('od_statReservations'), value: reservations.length, icon: '📋' }, { label: t('od_statMonthRevenue'), value: `¥${monthRevenue.toLocaleString()}`, icon: '💴' }, { label: t('od_totalRevenue'), value: `¥${totalRevenue.toLocaleString()}`, icon: '📈' }].map(s => (
            <Card key={s.label} className="text-center"><div className="text-2xl mb-1">{s.icon}</div><div className="text-white font-bold text-lg">{s.value}</div><div className="text-gray-500 text-xs">{s.label}</div></Card>
          ))}
        </div>

        {/* ── Upcoming pickups (next 7 days) — at-a-glance schedule ─── */}
        <div className="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm font-bold text-white mb-3">📅 {t('od_upcomingPickups')}</p>
          {upcomingPickups.length === 0 ? (
            <p className="text-xs text-gray-500">{t('od_noUpcoming')}</p>
          ) : (
            <div className="space-y-2">
              {upcomingPickups.map(r => {
                const veh = vehicles.find(v => String(v.id) === String(r.vehicle_id ?? r.vehicleId));
                const carName = veh ? `${veh.maker} ${veh.model}` : classLabelJa(r.target_class ?? r.targetClass ?? 'standard');
                return (
                  <button
                    key={r.id}
                    onClick={() => setTab('reservations')}
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-2.5 text-left transition-all hover:border-purple-500/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{carName}</p>
                        <p className="text-xs text-gray-500">{r.id}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-emerald-300">{t('od_pickupShort')}: {r.pickup_at?.slice(0, 16).replace('T', ' ')}</p>
                        <p className="text-[11px] text-gray-500">{t('od_returnShort')}: {r.return_at?.slice(0, 16).replace('T', ' ')}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        </>)}

        {/* ── MENU screen (Airbnb host style) ─────────────────────────── */}
        {tab === 'menu' && (
          <div className="space-y-4">
            {/* Earnings + insights cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => setTab('revenue')} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left">
                <p className="text-white font-bold text-[15px]">{t('ownerTabRevenue')}</p>
                <p className="text-gray-500 text-xs mt-0.5">{t('od_statMonthRevenue')} ¥{monthRevenue.toLocaleString()}</p>
                <div className="mt-5 flex items-end gap-1.5 h-16">
                  {monthlySeries.map((val, i) => (
                    <div key={i} className="flex-1 rounded-md" style={{
                      height: `${Math.max(6, (val / maxMonthly) * 100)}%`,
                      background: i === monthlySeries.length - 1 ? '#FF385C' : '#f0c2ce',
                    }} />
                  ))}
                </div>
              </button>
              <button onClick={() => setTab('renters')} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left">
                <p className="text-white font-bold text-[15px]">{t('od_insights')}</p>
                <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                  <span className="text-amber-400">★</span>
                  <span className="text-gray-700 font-semibold">{avgRating > 0 ? avgRating.toFixed(2) : '—'}</span>
                  <span>· {totalReviews}{t('od_reviewsSuffix')}</span>
                </p>
                <div className="mt-5 flex items-center gap-2">
                  {thumbs.length > 0 ? thumbs.map((src, i) => (
                    <img key={i} src={src} alt="" className="h-14 w-14 rounded-xl object-cover bg-gray-100" />
                  )) : (
                    <div className="h-14 w-full rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs">{t('od_noVehiclesYet')}</div>
                  )}
                </div>
              </button>
            </div>

            {/* Create new listing banner */}
            <button
              onClick={() => { setTab('vehicles'); setEditingVehicle(null); setShowAddForm(true); }}
              className="w-full flex items-center gap-4 rounded-2xl bg-gray-800 p-5 text-left"
            >
              <span className="text-3xl">🚙</span>
              <span className="min-w-0">
                <span className="block text-white font-bold text-[15px]">{t('od_addVehicleBtn')}</span>
                <span className="block text-gray-500 text-xs mt-0.5">{t('od_registerDesc')}</span>
              </span>
            </button>

            <button
              onClick={() => {
                dispatch({ type: 'SET_PAGE', v: 'owner-register', ownerOnboardingMode: 'store', ownerOnboardingParentOwnerId: owner.id });
                window.scrollTo(0, 0);
              }}
              className="w-full flex items-center gap-4 rounded-2xl border border-purple-500/30 bg-purple-950/40 p-5 text-left transition-all hover:border-purple-400/60 hover:bg-purple-950/60"
            >
              <span className="text-3xl">🏪</span>
              <span className="min-w-0">
                <span className="block text-white font-bold text-[15px]">{t('od_addStoreBtn')}</span>
                <span className="block text-purple-200/80 text-xs mt-0.5">{t('od_addStoreDesc')}</span>
              </span>
            </button>

            {/* Settings list */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
              {menuItems.map((tb, i) => (
                <button
                  key={tb.id}
                  onClick={() => { setTab(tb.id); if (tb.id === 'chat') setUnreadCount(0); }}
                  className={`w-full flex items-center gap-3.5 px-5 py-4 text-left ${i > 0 ? 'border-t border-gray-800' : ''}`}
                >
                  <OwnerDashboardTabIcon tab={tb} />
                  <span className="flex-1 min-w-0 text-white font-semibold text-[15px]">{tb.label}</span>
                  {tb.badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                      {tb.badge > 9 ? '9+' : tb.badge}
                    </span>
                  )}
                  <span className="text-gray-400 text-lg">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'vehicles' && (
          <div>
            <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-white font-bold">{t('od_vehicleList')}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingVehicle(null); setShowAddForm(v => !v); }} className="px-4 py-2 rounded-xl text-sm text-white font-semibold" style={{ background: g }}>
                  {showAddForm ? t('od_close') : t('od_addVehicleBtn')}
                </button>
              </div>
            </div>
            {showAddForm && <VehicleForm ownerId={owner.id} ownerAuthId={currentUser?.id} theme={theme} onSaved={async () => { setShowAddForm(false); await loadData(); }} onCancel={() => setShowAddForm(false)} />}
            {editingVehicle && (
              <VehicleForm
                key={editingVehicle.id}
                vehicle={editingVehicle}
                ownerId={owner.id}
                ownerAuthId={currentUser?.id}
                theme={theme}
                onSaved={async () => { setEditingVehicle(null); await loadData(); }}
                onCancel={() => setEditingVehicle(null)}
              />
            )}
            {vehicles.length > 0 && (
              <div className="relative mb-4">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                <input value={vehQuery} onChange={e => setVehQuery(e.target.value)} placeholder={t('od_vehicleSearchPh')}
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 py-2.5 pl-9 pr-8 text-sm text-white focus:border-purple-500 focus:outline-none" />
                {vehQuery && <button onClick={() => setVehQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">✕</button>}
              </div>
            )}
            {dataLoading ? <p className="text-gray-500 text-sm text-center py-8">{t('od_loading')}</p>
            : vehicles.length === 0 ? (
              <Card className="text-center py-10">
                <div className="text-4xl mb-3">🚗</div>
                <p className="text-gray-400 text-sm">{t('od_noVehiclesYet')}</p>
              </Card>
            ) : (() => {
              const shown = vehicles.filter(v => vehicleMatches(v, vehQuery));
              if (shown.length === 0) return <p className="text-gray-500 text-sm text-center py-8">{t('od_vehicleNoMatch')}</p>;
              return (
                <div className="space-y-4">
                  {shown.map(v => <VehicleStatusCard key={v.id} v={v} ownerId={owner.id} ownerAuthId={currentUser?.id} onRefresh={loadData} theme={theme} onEdit={(veh) => { setShowAddForm(false); setEditingVehicle(veh); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
                </div>
              );
            })()}
          </div>
        )}

        {tab === 'run-of-fleet' && (
          <RunOfFleetBoothManager vehicles={vehicles} theme={theme} onRefresh={loadData} />
        )}

        {tab === 'reservations' && (
          <div>
            {/* ── Run-of-fleet assignment panel (new) ─────────── */}
            <div className="mb-6">
              <RunOfFleetAssignmentPanel
                ownerId={owner?.id}
                currentUserId={currentUser?.id}
                onAssigned={loadData}
              />
            </div>
            <h3 className="text-white font-bold mb-4">{t('od_allReservations')}</h3>
            {reservations.length === 0 ? <Card className="text-center py-10"><div className="text-4xl mb-3">📋</div><p className="text-gray-400 text-sm">{t('od_noReservations')}。</p></Card>
            : <div className="space-y-3">{[...reservations].sort((a, b) => Number(isPendingAssignment(b)) - Number(isPendingAssignment(a))).map(r => {
                const reservationVehicleId = r.vehicle_id ?? r.vehicleId;
                const veh = vehicles.find(v => String(v.id) === String(reservationVehicleId));
                const needsAssignment = isPendingAssignment(r);
                const renterId = r.user_id ?? r.userId;
                const renterStats = renterReviewData?.renterStats?.[renterId] ?? null;
                const canApprove = String(r.status ?? '').toLowerCase() === 'pending';
                const canReject = ['pending', 'confirmed', 'pending_assignment'].includes(String(r.status ?? '').toLowerCase());
                return (
                <Card key={r.id} className={`flex flex-col gap-4 sm:flex-row sm:items-center ${needsAssignment ? 'border-purple-500/70 bg-purple-950/30' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold text-sm">{r.id}</span>
                      {needsAssignment
                        ? <Badge text="Action Required" color="pending_assignment" />
                        : <Badge text={r.status === 'confirmed' ? t('od_confirmed') : r.status === 'pending' ? t('od_pending') : r.status === 'rejected' ? 'Rejected' : t('od_cancelled')} color={r.status} />}
                    </div>
                    <p className="text-gray-400 text-xs">{needsAssignment ? `${classLabelJa(r.target_class ?? r.targetClass ?? 'standard')}${t('od_rofReservationSuffix')}` : (veh ? `${veh.maker} ${veh.model}` : reservationVehicleId)}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{(r.pickup_at ?? r.pickup)?.slice(0, 16)} → {(r.return_at ?? r.ret)?.slice(0, 16)}</p>
                    {renterId && <RenterTrustSnapshot stats={renterStats} />}
                  </div>
                  <div className="w-full flex-shrink-0 text-left sm:w-auto sm:text-right">
                    <p className="text-purple-400 font-bold">¥{reservationPaidAmount(r).toLocaleString()}</p>
                    <p className="text-gray-600 text-xs">{r.days}{t('od_daysUnit')}</p>
                    {(canApprove || canReject) && (
                      <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                        {canApprove && (
                          <button
                            onClick={() => decideReservation(r, 'approve')}
                            disabled={decisioning === `${r.id}:approve`}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            {decisioning === `${r.id}:approve` ? '…' : dashText(t, 'owd_lend')}
                          </button>
                        )}
                        {canReject && (
                          <button
                            onClick={() => decideReservation(r, 'reject')}
                            disabled={decisioning === `${r.id}:reject`}
                            className="rounded-lg border border-red-700 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-950/40 disabled:opacity-60"
                          >
                            {decisioning === `${r.id}:reject` ? '…' : dashText(t, 'owd_dontLend')}
                          </button>
                        )}
                      </div>
                    )}
                    {needsAssignment && (
                      <button onClick={() => setAssigningReservation(r)} className="mt-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500">
                        Assign Vehicle
                      </button>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                      <button onClick={() => setInspectingReservation(r)}
                        className="rounded-lg border border-purple-700 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-900/30">
                        📸 {t('di_openInspection')}
                      </button>
                      <a href={`/api/contract?reservationId=${encodeURIComponent(r.id)}&locale=${locale}`} target="_blank" rel="noopener noreferrer"
                        className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-800">
                        📄 {t('sc_contract')}
                      </a>
                    </div>
                  </div>
                </Card>
              ); })}</div>}
          </div>
        )}

        {tab === 'calendar' && (
          <OwnerCalendar vehicles={vehicles} reservations={reservations} />
        )}

        {tab === 'pickup' && (
          <Card><OwnerPickupScanner ownerId={owner.id} theme={theme} /></Card>
        )}

        {tab === 'renters' && (
          <div className="space-y-4">
            <OwnerProfileReviewSummary profile={ownerReviewProfile} />
            <OwnerRenterReviews owner={owner} reservations={reservations} vehicles={vehicles} currentUser={currentUser} theme={theme} />
          </div>
        )}

        {tab === 'chat' && (
          <OwnerChatInbox ownerId={owner.id} ownerUserId={currentUser?.id} vehicles={vehicles} theme={theme} />
        )}

        {tab === 'addons' && <Card><StoreAddonsEditor ownerId={owner.id} theme={theme} /></Card>}

        {tab === 'best-go-oneway' && (
          <BestGoOneWayManagement
            ownerId={owner.id}
            ownerAuthId={currentUser?.id}
            reservations={reservations}
            vehicles={vehicles}
            theme={theme}
          />
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            <OwnerSettings
              ownerId={owner.id}
              owner={owner}
              theme={theme}
              skin={ownerSkin}
              onSkinChange={changeSkin}
              onOwnerUpdated={(nextOwner) => setOwner(prev => ({ ...prev, ...nextOwner }))}
            />
            <OwnerLocationsManager ownerId={owner.id} ownerAuthId={currentUser?.id} theme={theme} />
          </div>
        )}

        {tab === 'revenue' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card><p className="text-gray-400 text-xs mb-1">{t('od_statMonthRevenue')}</p><p className="text-3xl font-bold text-white">¥{monthRevenue.toLocaleString()}</p></Card>
              <Card><p className="text-gray-400 text-xs mb-1">{t('od_totalRevenue')}</p><p className="text-3xl font-bold text-white">¥{totalRevenue.toLocaleString()}</p></Card>
            </div>
            {/* ── 振込申請（payout） ─────────────────────────── */}
            <Card>
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <p className="text-gray-400 text-xs mb-1">{t('po_available')}</p>
                  <p className="text-3xl font-bold text-white">¥{payoutAvailable.toLocaleString()}</p>
                  <p className="text-gray-500 text-[11px] mt-1">{t('po_availableHint').replace('{fee}', platformFeePercent)}</p>
                  {Number(payoutReserved) > 0 && (
                    <p className="text-gray-500 text-[11px]">{t('po_reservedNote').replace('{n}', Number(payoutReserved).toLocaleString())}</p>
                  )}
                </div>
                <span className="text-2xl">💸</span>
              </div>

              {!hasBankAccount ? (
                // 銀行未登録 → 直感的に登録へ誘導
                <div className="rounded-xl border border-amber-600/40 bg-amber-900/15 p-3">
                  <p className="text-amber-200 font-semibold text-sm">🏦 {t('po_noBankTitle')}</p>
                  <p className="text-amber-100/80 text-xs mt-1 mb-3 leading-relaxed">{t('po_noBankDesc')}</p>
                  <button
                    onClick={goRegisterBank}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-white font-bold text-sm"
                    style={{ background: g }}
                  >
                    {t('po_registerBankCta')} →
                  </button>
                </div>
              ) : payoutAvailable <= 0 ? (
                <p className="text-gray-500 text-sm">{t('po_zeroBalance')}</p>
              ) : (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t('po_amountLabel')}</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="number" min="1" max={payoutAvailable} step="1"
                      value={payoutAmount}
                      onChange={e => setPayoutAmount(e.target.value)}
                      placeholder={String(payoutAvailable)}
                      className={`${inp} sm:flex-1`}
                    />
                    <GradBtn theme={theme} onClick={submitPayout} disabled={payoutSubmitting} className="px-5 py-3 text-sm">
                      {payoutSubmitting ? t('po_submitting') : t('po_submit')}
                    </GradBtn>
                  </div>
                </div>
              )}
              {payoutMsg && <p className="text-xs text-gray-400 mt-2">{payoutMsg}</p>}

              {/* 申請履歴 */}
              <div className="mt-4 border-t border-gray-800 pt-3">
                <p className="text-white font-semibold text-sm mb-2">{t('po_history')}</p>
                {payouts.length === 0 ? (
                  <p className="text-gray-500 text-xs">{t('po_none')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {payouts.slice(0, 10).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-800/70">
                        <div className="min-w-0">
                          <span className="text-white font-mono">¥{Number(p.amount).toLocaleString()}</span>
                          <span className="text-gray-500 text-[11px] ml-2">{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                        <PayoutStatusPill status={p.status} t={t} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <OwnerRevenueChart reservations={reservations} vehicles={vehicles} theme={theme} t={t} />
            <Card>
              <h4 className="text-white font-bold text-sm mb-4">{t('od_recentConfirmed')}</h4>
              {confirmedRes.length === 0 ? <p className="text-gray-500 text-sm">{t('od_noConfirmed')}</p>
              : <div className="space-y-2">{confirmedRes.slice(0, 10).map(r => {
                const reservationVehicleId = r.vehicle_id ?? r.vehicleId;
                const veh = vehicles.find(v => String(v.id) === String(reservationVehicleId));
                return (
                <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-800 text-sm">
                  <div><span className="text-white">{r.id}</span><span className="text-gray-500 text-xs ml-2">{veh ? `${veh.maker} ${veh.model}` : reservationVehicleId ?? ''}</span></div>
                  <span className="text-purple-400 font-mono font-bold">¥{reservationPaidAmount(r).toLocaleString()}</span>
                </div>
              ); })}</div>}
            </Card>
          </div>
        )}
      </div>
      {inspectingReservation && (
        <DamageInspection reservation={inspectingReservation} onClose={() => setInspectingReservation(null)} />
      )}
      <VehicleAssignmentModal
        reservation={assigningReservation}
        ownerId={owner.id}
        currentUserId={currentUser?.id}
        theme={theme}
        onClose={() => setAssigningReservation(null)}
        onAssigned={() => { setAssigningReservation(null); loadData(); }}
      />
    </div>
  );
}

// ── Revenue chart + utilization (Chart.js from CDN) ─────────────────
function loadChartLib() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.Chart) return Promise.resolve(window.Chart);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('chartjs-lib');
    if (existing) { existing.addEventListener('load', () => resolve(window.Chart)); return; }
    const s = document.createElement('script');
    s.id = 'chartjs-lib';
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function OwnerRevenueChart({ reservations, vehicles, theme, t }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const now = new Date();

  const paid = (r) => Number(r.stripePaidAmount ?? r.stripe_paid_amount ?? r.total ?? 0);
  const dateOf = (r) => r.pickup_at ?? r.pickup ?? r.created_at ?? r.createdAt ?? null;

  // Monthly revenue — last 6 months.
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}` });
  }
  const revByMonth = Object.fromEntries(months.map(m => [m.key, 0]));
  (reservations ?? []).filter(r => r.status === 'confirmed').forEach(r => {
    const raw = dateOf(r); if (!raw) return;
    const d = new Date(raw); const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (k in revByMonth) revByMonth[k] += paid(r);
  });
  const series = months.map(m => revByMonth[m.key]);
  const sig = series.join(',');

  useEffect(() => {
    let alive = true;
    loadChartLib().then(Chart => {
      if (!alive || !canvasRef.current) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const accent = theme?.accent ?? '#a855f7';
      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: months.map(m => `${m.label}${t('owd_monthSuffix')}`),
          datasets: [{ data: series, backgroundColor: accent, borderRadius: 6, maxBarThickness: 40 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '¥' + Number(c.raw).toLocaleString() } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: (v) => '¥' + Number(v).toLocaleString() } },
          },
        },
      });
    }).catch(() => {});
    return () => { alive = false; if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Utilization — booked days in the last 30 days per vehicle.
  const winStart = new Date(now.getTime() - 30 * 86400000);
  const overlapDays = (r) => {
    const p = r.pickup_at ?? r.pickup, ret = r.return_at ?? r.ret;
    if (!p || !ret) return 0;
    const a = new Date(Math.max(new Date(p), winStart));
    const b = new Date(Math.min(new Date(ret), now));
    return b > a ? (b - a) / 86400000 : 0;
  };
  const util = (vehicles ?? []).map(v => {
    const days = (reservations ?? [])
      .filter(r => !['cancelled', 'canceled', 'rejected'].includes(String(r.status ?? '').toLowerCase()))
      .filter(r => String(r.vehicle_id ?? r.vehicleId) === String(v.id))
      .reduce((s, r) => s + overlapDays(r), 0);
    return { v, pct: Math.min(100, Math.round((days / 30) * 100)) };
  }).sort((a, b) => b.pct - a.pct).slice(0, 8);
  const hasUtil = util.some(u => u.pct > 0);

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="text-white font-bold text-sm mb-3">📊 {t('od_revChartTitle')}</h4>
        <div className="h-52"><canvas ref={canvasRef} /></div>
      </Card>
      <Card>
        <h4 className="text-white font-bold text-sm mb-3">🚗 {t('od_utilTitle')}</h4>
        {!hasUtil ? <p className="text-gray-500 text-sm">{t('od_utilNone')}</p> : (
          <div className="space-y-2.5">
            {util.map(({ v, pct }) => (
              <div key={v.id} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 truncate text-xs text-gray-300">{v.maker} {v.model}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${theme?.primary ?? '#7c3aed'}, ${theme?.accent ?? '#a855f7'})` }} />
                </div>
                <span className="w-10 flex-shrink-0 text-right text-xs font-bold text-white">{pct}%</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BestGoOneWayManagement({ ownerId, ownerAuthId, reservations = [], vehicles = [], theme }) {
  const { t } = useI18n();
  const [activeBestGoOneWaySection, setActiveBestGoOneWaySection] = useState('accept');
  const mode = activeBestGoOneWaySection === 'best-one-way' ? 'best-one-way' : 'best-go';
  const g = grad(theme);
  const activeVehicles = vehicles.filter(v => (v.approval_status ?? 'approved') === 'approved' && (v.status ?? 'active') === 'active');
  const openReservations = reservations.filter(r => !['cancelled', 'rejected'].includes(String(r.status ?? '').toLowerCase()));
  const tabs = [
    { id: 'best-go', title: 'Best Anywhere', desc: t('bestGoManagerBestGoDesc') },
    { id: 'best-one-way', title: 'Best Match', desc: t('bestGoManagerOneWayDesc') },
  ];
  const publishManagerSection = useCallback((section) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('best-go-oneway-nav-active', { detail: section }));
  }, []);
  const selectMode = (nextMode) => {
    const nextSection = nextMode === 'best-one-way' ? 'best-one-way' : 'accept';
    setActiveBestGoOneWaySection(nextSection);
    publishManagerSection(nextSection);
  };
  const navigateManagerSection = useCallback((section) => {
    const nextSection = ['accept', 'vehicles', 'send', 'ops', 'best-one-way'].includes(section)
      ? section
      : 'accept';
    setActiveBestGoOneWaySection(nextSection);
    publishManagerSection(nextSection);
    if (section === 'best-one-way') {
      return;
    }
  }, [publishManagerSection]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__bestGoOneWayNavigate = navigateManagerSection;
    return () => {
      if (window.__bestGoOneWayNavigate === navigateManagerSection) {
        delete window.__bestGoOneWayNavigate;
      }
    };
  }, [navigateManagerSection]);

  return (
    <div data-best-go-oneway-management className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-purple-500/40 bg-gray-900">
        <div className="border-b border-gray-800 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">BEST mobility ops</p>
              <h3 className="mt-1 text-xl font-black text-white">{t('ownerTabBestGoOneWay')}</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-400">{t('bestGoManagerDesc')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-64">
              <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-500">{t('od_statVehicles')}</p>
                <p className="mt-1 text-2xl font-black text-white">{activeVehicles.length}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-500">{t('od_statReservations')}</p>
                <p className="mt-1 text-2xl font-black text-white">{openReservations.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {tabs.map(tab => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectMode(tab.id)}
                  className={`rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
                    active ? 'border-purple-500 bg-purple-500/15 text-white' : 'border-gray-800 bg-gray-950/60 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{tab.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{tab.desc}</p>
                    </div>
                    <span
                      className="mt-0.5 h-3 w-3 flex-shrink-0 rounded-full ring-2 ring-gray-700"
                      style={active ? { background: g, boxShadow: '0 0 0 3px rgba(168,85,247,.18)' } : {}}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === 'best-go' ? (
        <CrossReturnPanel ownerId={ownerId} reservations={reservations} vehicles={vehicles} theme={theme} activeSection={activeBestGoOneWaySection} />
      ) : (
        <div data-best-go-oneway-section="best-one-way" className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-white">{t('bestGoManagerPublishTitle')}</h3>
                <p className="mt-1 text-xs text-gray-500">{t('bestGoManagerPublishDesc')}</p>
              </div>
              <OneWayPublishLauncher vehicles={vehicles} ownerId={ownerId} ownerAuthId={ownerAuthId} />
            </div>
          </div>
          <OneWayReturnSettings ownerId={ownerId} vehicles={vehicles} theme={theme} />
        </div>
      )}
    </div>
  );
}

// ── OneWayReturnSettings ─────────────────────────────────────────
function OneWayReturnSettings({ ownerId, vehicles, theme }) {
  const { t } = useI18n();
  const g = grad(theme);
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ vehicleId: '', name: '', address: '', price: '' });

  const loadLocations = useCallback(async () => {
    try {
      const res = await fetch(`/api/one-way-locations?ownerId=${ownerId}`);
      const data = await res.json();
      setLocations(Array.isArray(data) ? data : []);
    } catch {
      setLocations([]);
    }
  }, [ownerId]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) { setError(t('od_errReturnName')); return; }
    if (Number(form.price) < 0) { setError(t('od_errPricePositive')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/one-way-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId,
          vehicleId: form.vehicleId || null,
          name: form.name.trim(),
          address: form.address.trim(),
          price: Number(form.price) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('od_errSaveFailed2'));
      setForm({ vehicleId: '', name: '', address: '', price: '' });
      await loadLocations();
    } catch (err) {
      setError(err.message || t('od_errSaveFailed2'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-white font-bold mb-1">{t('od_oneWaySettingsTitle')}</h3>
        <p className="text-gray-500 text-xs mb-5">{t('od_oneWaySettingsDesc')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs text-gray-400 mb-1">{t('od_targetVehicle')}</label>
            <select value={form.vehicleId} onChange={e => update('vehicleId', e.target.value)} className={inp}>
              <option value="">{t('od_allVehicles')}</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.maker} {v.model}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('od_extraFee')}</label>
            <input type="number" min="0" value={form.price} onChange={e => update('price', e.target.value)} className={inp} placeholder="3300" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('od_returnName')}</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} className={inp} placeholder="Haneda Airport Terminal 3" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('od_addressNote')}</label>
            <input value={form.address} onChange={e => update('address', e.target.value)} className={inp} placeholder="Meet at arrivals floor" />
          </div>
        </div>
        {error && <p className="text-red-300 text-xs mt-3">{error}</p>}
        <button onClick={save} disabled={saving} className="mt-4 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: g }}>
          {saving ? t('od_saving') : t('od_addReturnLoc')}
        </button>
      </Card>

      <Card>
        <h4 className="text-white font-semibold text-sm mb-3">{t('od_registeredReturnLocs')}</h4>
        {locations.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">{t('od_noSettings')}</p>
        ) : (
          <div className="space-y-2">
            {locations.map(loc => {
              const vehicle = vehicles.find(v => String(v.id) === String(loc.vehicle_id));
              return (
                <div key={loc.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700">
                  <div>
                    <p className="text-white text-sm font-semibold">{loc.name}</p>
                    <p className="text-gray-500 text-xs">{vehicle ? `${vehicle.maker} ${vehicle.model}` : t('od_allVehicles')}{loc.address ? ` · ${loc.address}` : ''}</p>
                  </div>
                  <p className="text-purple-300 font-bold text-sm">+¥{Number(loc.price ?? 0).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── OwnerSettings ─────────────────────────────────────────────────
function OwnerSettings({ ownerId, owner, theme, skin, onSkinChange, onOwnerUpdated }) {
  const g = grad(theme);
  const { t } = useI18n();

  // localStorage から設定を読み込む（SSR安全）
  const [preferredLang,   setPreferredLang]   = useState('ja');
  const [autoTranslate,   setAutoTranslate]   = useState(true);
  const [bookingEmailContact, setBookingEmailContact] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactMsg, setContactMsg] = useState('');
  const [preBookingChatEnabled, setPreBookingChatEnabled] = useState(Boolean(owner?.pre_booking_chat_enabled ?? owner?.preBookingChatEnabled));
  const [savingPreBookingChat, setSavingPreBookingChat] = useState(false);
  const [preBookingChatMsg, setPreBookingChatMsg] = useState('');
  const [preauthMode, setPreauthMode] = useState(owner?.preauth_mode === 'one' ? 'one' : 'zero');
  const [preauthMsg, setPreauthMsg] = useState('');

  // 振込先の銀行口座（任意・後から登録できる）
  const [bankName, setBankName]                 = useState(owner?.bank_name ?? '');
  const [bankBranch, setBankBranch]             = useState(owner?.bank_branch ?? '');
  const [bankAccountType, setBankAccountType]   = useState(owner?.bank_account_type ?? 'ordinary');
  const [bankAccountNumber, setBankAccountNumber] = useState(owner?.bank_account_number ?? '');
  const [bankAccountHolder, setBankAccountHolder] = useState(owner?.bank_account_holder ?? '');
  const [savingBank, setSavingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState('');

  useEffect(() => {
    setBankName(owner?.bank_name ?? '');
    setBankBranch(owner?.bank_branch ?? '');
    setBankAccountType(owner?.bank_account_type ?? 'ordinary');
    setBankAccountNumber(owner?.bank_account_number ?? '');
    setBankAccountHolder(owner?.bank_account_holder ?? '');
  }, [owner?.bank_name, owner?.bank_branch, owner?.bank_account_type, owner?.bank_account_number, owner?.bank_account_holder]);

  const saveBank = async () => {
    setSavingBank(true);
    setBankMsg('');
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ownerId,
          bankName, bankBranch, bankAccountType, bankAccountNumber, bankAccountHolder,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? t('od_errSaveFailed'));
      onOwnerUpdated?.(json);
      setBankMsg(t('po_saved'));
    } catch (e) {
      setBankMsg(e.message);
    } finally {
      setSavingBank(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lang = localStorage.getItem(`owner_lang_${ownerId}`);
    if (lang) setPreferredLang(lang);
    setAutoTranslate(localStorage.getItem(`owner_autotrans_${ownerId}`) !== 'false');
  }, [ownerId]);

  useEffect(() => {
    setBookingEmailContact(owner?.booking_email_contact ?? '');
  }, [owner?.booking_email_contact]);

  useEffect(() => {
    setPreBookingChatEnabled(Boolean(owner?.pre_booking_chat_enabled ?? owner?.preBookingChatEnabled));
  }, [owner?.pre_booking_chat_enabled, owner?.preBookingChatEnabled]);

  const saveLang = (lang) => {
    setPreferredLang(lang);
    localStorage.setItem(`owner_lang_${ownerId}`, lang);
  };

  const toggleAutoTranslate = () => {
    const next = !autoTranslate;
    setAutoTranslate(next);
    localStorage.setItem(`owner_autotrans_${ownerId}`, String(next));
  };

  const savePreauth = async (mode) => {
    setPreauthMode(mode);
    setPreauthMsg('');
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ownerId, preauthMode: mode }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? t('od_errSaveFailed'));
      setPreauthMsg(t('sc_saved'));
    } catch (e) { setPreauthMsg(e.message); }
  };

  const saveBookingContact = async () => {
    setSavingContact(true);
    setContactMsg('');
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ownerId, bookingEmailContact }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? t('od_errSaveFailed'));
      setContactMsg(t('od_savedContact'));
    } catch (e) {
      setContactMsg(e.message);
    } finally {
      setSavingContact(false);
    }
  };

  const savePreBookingChat = async (enabled) => {
    setSavingPreBookingChat(true);
    setPreBookingChatMsg('');
    setPreBookingChatEnabled(enabled);
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ownerId, preBookingChatEnabled: enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? t('od_errSaveFailed'));
      const savedEnabled = Boolean(json?.pre_booking_chat_enabled ?? json?.preBookingChatEnabled ?? enabled);
      setPreBookingChatEnabled(savedEnabled);
      onOwnerUpdated?.({ ...json, pre_booking_chat_enabled: savedEnabled, preBookingChatEnabled: savedEnabled });
      setPreBookingChatMsg(t('sc_saved'));
    } catch (e) {
      setPreBookingChatEnabled(!enabled);
      setPreBookingChatMsg(e.message);
    } finally {
      setSavingPreBookingChat(false);
    }
  };

  const LANG_OPTIONS = [
    { code: 'ja',    label: '日本語',    flag: '🇯🇵' },
    { code: 'en',    label: 'English',   flag: '🇺🇸' },
    { code: 'zh-TW', label: '繁體中文',  flag: '🇹🇼' },
    { code: 'zh-CN', label: '简体中文',  flag: '🇨🇳' },
    { code: 'ko',    label: '한국어',    flag: '🇰🇷' },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-white font-bold text-lg">{t('od_settings')}</h3>

      {/* 管理画面の配色（ここで操作しやすく） */}
      <Card>
        <h4 className="text-white font-semibold text-sm mb-1">🎨 {t('ownerAppearance')}</h4>
        <p className="text-gray-500 text-xs mb-4">{t('od_skinDesc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SKIN_OPTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => onSkinChange?.(s.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                skin === s.id ? 'text-white border-transparent' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
              style={skin === s.id ? { background: g } : {}}
            >
              <span className="text-lg">{s.emoji}</span>
              {s.labelKey ? (t(s.labelKey) || s.label) : s.label}
              {skin === s.id && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      </Card>

      {/* 言語設定 */}
      <Card>
        <h4 className="text-white font-semibold text-sm mb-1">{t('od_backendLang')}</h4>
        <p className="text-gray-500 text-xs mb-4">{t('od_backendLangDesc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANG_OPTIONS.map(l => (
            <button
              key={l.code}
              onClick={() => saveLang(l.code)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                preferredLang === l.code
                  ? 'text-white border-transparent'
                  : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
              style={preferredLang === l.code ? { background: g } : {}}
            >
              <span className="text-lg">{l.flag}</span>
              {l.label}
              {preferredLang === l.code && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h4 className="text-white font-semibold text-sm mb-1">{t('od_storeContact')}</h4>
        <p className="text-gray-500 text-xs mb-3">{t('od_storeContactDesc')}</p>
        <textarea
          value={bookingEmailContact}
          onChange={e => setBookingEmailContact(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={t('od_phStoreContact')}
          className={`${inp} min-h-32`}
        />
        <div className="mt-3 flex items-center gap-3">
          <GradBtn theme={theme} onClick={saveBookingContact} disabled={savingContact} className="px-4 py-2 text-sm">
            {savingContact ? t('od_saving') : t('od_save')}
          </GradBtn>
          {contactMsg && <span className="text-xs text-gray-400">{contactMsg}</span>}
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className="text-white font-semibold text-sm mb-1">{dashText(t, 'owd_preBookingChat')}</h4>
            <p className="text-gray-500 text-xs leading-relaxed">
              {t('owd_preBookingChatDesc')}
            </p>
            {preBookingChatMsg && <p className="mt-2 text-xs text-gray-400">{preBookingChatMsg}</p>}
          </div>
          <button
            onClick={() => savePreBookingChat(!preBookingChatEnabled)}
            disabled={savingPreBookingChat}
            className={`relative h-8 w-16 flex-shrink-0 rounded-full transition-all disabled:opacity-60 ${preBookingChatEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}
            aria-pressed={preBookingChatEnabled}
            aria-label={t('owd_preBookingChatToggle')}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${preBookingChatEnabled ? 'left-9' : 'left-1'}`} />
          </button>
        </div>
      </Card>

      {/* 振込先の銀行口座（任意・後から登録／変更できる） */}
      <Card>
        <div id="owner-bank-settings" className="scroll-mt-24">
          <h4 className="text-white font-semibold text-sm mb-1">🏦 {t('po_bankSectionTitle')}</h4>
          <p className="text-gray-500 text-xs mb-4">{t('po_bankOptionalHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('oo_bankName')}</label>
              <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder={t('oo_phBankName')} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('oo_bankBranch')}</label>
              <input value={bankBranch} onChange={e => setBankBranch(e.target.value)} placeholder={t('oo_phBankBranch')} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('oo_acctType')}</label>
              <select value={bankAccountType} onChange={e => setBankAccountType(e.target.value)} className={inp}>
                <option value="ordinary">{t('oo_acctOrdinary')}</option>
                <option value="checking">{t('oo_acctChecking')}</option>
                <option value="savings">{t('oo_acctSavings')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('oo_acctNo')}</label>
              <input value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} placeholder="1234567" inputMode="numeric" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">{t('oo_acctHolder')}</label>
              <input value={bankAccountHolder} onChange={e => setBankAccountHolder(e.target.value)} placeholder={t('oo_phAcctHolder')} className={inp} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <GradBtn theme={theme} onClick={saveBank} disabled={savingBank} className="px-4 py-2 text-sm">
              {savingBank ? t('po_saving') : t('po_save')}
            </GradBtn>
            {bankMsg && <span className="text-xs text-gray-400">{bankMsg}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="text-white font-semibold text-sm mb-1">🔐 {t('sc_ownerCardTitle')}</h4>
        <div className="flex items-start gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 p-3">
          <span className="text-emerald-400">✅</span>
          <p className="text-xs leading-relaxed text-emerald-100/85">{t('sc_ownerCardOnFile')}</p>
        </div>
      </Card>

      {/* 自動翻訳トグル */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">{t('od_autoTransTitle')}</h4>
            <p className="text-gray-500 text-xs">{t('od_autoTransDesc')}</p>
          </div>
          <button
            onClick={toggleAutoTranslate}
            className={`ml-4 w-14 h-7 rounded-full transition-all relative flex-shrink-0 ${autoTranslate ? 'bg-purple-600' : 'bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${autoTranslate ? 'left-8' : 'left-1'}`} />
          </button>
        </div>
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${autoTranslate ? 'bg-green-900/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
          {autoTranslate ? t('od_autoTransOnFull') : t('od_autoTransOffFull')}
        </div>
      </Card>
    </div>
  );
}
