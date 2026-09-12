'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { supabase } from '../lib/supabase';
import { GradBtn, StatusBadge, Tag } from './Shared';
import { VEHICLE_CLASSES, JAPAN_AIRPORTS } from '../lib/data';
import InspectionUploader from './InspectionUploader';
import VehicleImageUploader from './VehicleImageUploader';
import AdminMapPicker from './AdminMapPicker';
import LanguageSwitcher from './LanguageSwitcher';
import AdminReviews from './AdminReviews';
import { geocodeAddress as gmapsGeocode } from '../lib/googleMaps';
import { MASTER_EMAIL } from '../lib/master';
import { isMasterDeletedOwner, withoutMasterDeletedOwners } from '../lib/ownerVisibility';
import { normalizeVehicleClass } from '../lib/runOfFleet';

// ── Sidebar tab definitions (uses t() at render time) ────────────────────────
const ADMIN_TAB_DEFS = [
  { id: 'dashboard',    icon: '📊', key: 'dashboard' },
  { id: 'vehicles',     icon: '🚗', key: 'vehicles' },
  { id: 'parking',      icon: '🅿️', key: 'parking' },
  { id: 'reservations', icon: '📋', key: 'reservations' },
  { id: 'owner-revenue', icon: '💴', key: 'ownerRevenue' },
  { id: 'payouts',      icon: '💸', key: 'po_adminTab' },
  { id: 'users',        icon: '👥', key: 'users' },
  { id: 'reviews',      icon: '⭐', key: 'reviews' },
  { id: 'owners',       icon: '🏪', key: 'owners' },
  { id: 'vehicle-approval', icon: '🔍', key: 'vehicleApproval' },
  { id: 'banners',      icon: '🖼️', key: 'bannerManager' },
  { id: 'theme',        icon: '🎨', key: 'themeEditor' },
  { id: 'pages',        icon: '📄', key: 'legalPagesEditor' },
];

const MASTER_TAB_DEFS = [
  { id: 'master',       icon: '★', key: 'mst_tab', group: 'mst_rootAuthority' },
  { id: 'users',        icon: '👥', key: 'mst_navAccounts', group: 'mst_rootAuthority' },
  { id: 'owners',       icon: '🏪', key: 'mst_navStores', group: 'mst_rootAuthority' },
  { id: 'reservations', icon: '📋', key: 'mst_navReservations', group: 'mst_platformOps' },
  { id: 'vehicles',     icon: '🚗', key: 'mst_navVehicles', group: 'mst_platformOps' },
  { id: 'vehicle-approval', icon: '🔍', key: 'mst_navApprovals', group: 'mst_platformOps' },
  { id: 'authorizations', icon: '💳', key: 'mst_navAuthorizations', group: 'mst_financeOps' },
  { id: 'owner-revenue', icon: '💴', key: 'mst_navRevenue', group: 'mst_financeOps' },
  { id: 'payouts',      icon: '💸', key: 'mst_navPayouts', group: 'mst_financeOps' },
  { id: 'reviews',      icon: '⭐', key: 'mst_navAudit', group: 'mst_auditControl' },
  { id: 'banners',      icon: '🖼️', key: 'bannerManager', group: 'mst_systemConfig' },
  { id: 'theme',        icon: '🎨', key: 'themeEditor', group: 'mst_systemConfig' },
  { id: 'pages',        icon: '📄', key: 'legalPagesEditor', group: 'mst_systemConfig' },
];

function hexRgb(color) {
  if (typeof color !== 'string') return null;
  const raw = color.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function isLightThemeBg(color) {
  const rgb = hexRgb(color);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.68;
}

function AdminReadableLightStyles() {
  return (
    <style>{`
      .admin-readable-light main { color:#111827; }
      .admin-readable-light main .bg-gray-950 { background:#f8fafc !important; }
      .admin-readable-light main .bg-gray-900,
      .admin-readable-light main .bg-gray-900\\/90,
      .admin-readable-light main .bg-gray-900\\/80 { background:#ffffff !important; }
      .admin-readable-light main .bg-gray-800 { background:#f1f5f9 !important; }
      .admin-readable-light main .bg-gray-800\\/40,
      .admin-readable-light main .bg-gray-800\\/50 { background:#f8fafc !important; }
      .admin-readable-light main .bg-gray-700,
      .admin-readable-light main .bg-gray-700\\/60 { background:#e5e7eb !important; }
      .admin-readable-light main .border-gray-800 { border-color:#e2e8f0 !important; }
      .admin-readable-light main .border-gray-700 { border-color:#cbd5e1 !important; }
      .admin-readable-light main .border-gray-600 { border-color:#94a3b8 !important; }
      .admin-readable-light main .text-white,
      .admin-readable-light main .text-gray-100 { color:#111827 !important; }
      .admin-readable-light main .text-gray-200 { color:#1f2937 !important; }
      .admin-readable-light main .text-gray-300 { color:#334155 !important; }
      .admin-readable-light main .text-gray-400 { color:#475569 !important; }
      .admin-readable-light main .text-gray-500 { color:#64748b !important; }
      .admin-readable-light main .text-gray-600 { color:#475569 !important; }
      .admin-readable-light main .text-gray-700 { color:#334155 !important; }
      .admin-readable-light main input,
      .admin-readable-light main textarea,
      .admin-readable-light main select { color:#111827 !important; }
      .admin-readable-light main input::placeholder,
      .admin-readable-light main textarea::placeholder { color:#64748b !important; opacity:1 !important; }
      .admin-readable-light main [style*="linear-gradient"],
      .admin-readable-light main button[style*="linear-gradient"],
      .admin-readable-light main .bg-purple-600,
      .admin-readable-light main .bg-red-600,
      .admin-readable-light main .bg-red-700,
      .admin-readable-light main .bg-red-800,
      .admin-readable-light main .bg-green-700,
      .admin-readable-light main .bg-amber-600,
      .admin-readable-light main .bg-orange-600,
      .admin-readable-light main .bg-blue-600 { color:#ffffff !important; }
      .admin-readable-light main .bg-green-900\\/20,
      .admin-readable-light main .bg-green-900\\/40 { background:#e8f7ee !important; }
      .admin-readable-light main .text-green-300,
      .admin-readable-light main .text-green-400 { color:#16733c !important; }
      .admin-readable-light main .border-green-700\\/40,
      .admin-readable-light main .border-green-700\\/60 { border-color:#9bd8b2 !important; }
      .admin-readable-light main .bg-yellow-900\\/30,
      .admin-readable-light main .bg-yellow-900\\/40 { background:#fff3cd !important; }
      .admin-readable-light main .text-yellow-300,
      .admin-readable-light main .text-yellow-400 { color:#8a6200 !important; }
      .admin-readable-light main .border-yellow-700\\/40 { border-color:#dfbf62 !important; }
      .admin-readable-light main .bg-amber-900\\/20,
      .admin-readable-light main .bg-amber-500\\/10 { background:#fff4d6 !important; }
      .admin-readable-light main .text-amber-100,
      .admin-readable-light main .text-amber-200,
      .admin-readable-light main .text-amber-300 { color:#8a5200 !important; }
      .admin-readable-light main .border-amber-600\\/50,
      .admin-readable-light main .border-amber-500\\/40 { border-color:#d9a441 !important; }
      .admin-readable-light main .bg-red-900\\/40 { background:#fde8e8 !important; }
      .admin-readable-light main .text-red-400 { color:#b42323 !important; }
      .admin-readable-light main .border-red-700\\/40 { border-color:#f0a8a8 !important; }
      .admin-readable-light main .bg-purple-950\\/50,
      .admin-readable-light main .bg-purple-900\\/30,
      .admin-readable-light main .bg-purple-900\\/60 { background:#f1ecfb !important; }
      .admin-readable-light main .text-purple-100,
      .admin-readable-light main .text-purple-200,
      .admin-readable-light main .text-purple-300 { color:#5b21b6 !important; }
      .admin-readable-light main .border-purple-500\\/30,
      .admin-readable-light main .border-purple-500\\/40,
      .admin-readable-light main .border-purple-500\\/50,
      .admin-readable-light main .border-purple-500\\/60 { border-color:#c9b5f2 !important; }
      .admin-readable-light main pre { color:#334155 !important; }
    `}</style>
  );
}

function ownersListUrl() {
  return `/api/owners?_=${Date.now()}`;
}

async function fetchOwnersList() {
  const res = await fetch(ownersListUrl(), { cache: 'no-store' });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function adminVehicleFromRow(v) {
  if (!v) return v;
  return {
    ...v,
    priceDay: v.priceDay ?? v.price_day,
    priceHour: v.priceHour ?? v.price_hour,
    insurancePlans: v.insurancePlans ?? v.insurance_plans ?? null,
    largeSuitcases: v.largeSuitcases ?? v.large_suitcases ?? 0,
    smallBags: v.smallBags ?? v.small_bags ?? 0,
    img: v.img ?? v.img_url,
    inspectionCertUrl: v.inspectionCertUrl ?? v.inspection_cert_url,
    insuranceCertUrl: v.insuranceCertUrl ?? v.insurance_cert_url,
    inspectionExpiry: v.inspectionExpiry ?? v.inspection_expiry,
    licensePlate: v.licensePlate ?? v.license_plate,
    approvalStatus: v.approvalStatus ?? v.approval_status,
    oneWayEnabled: v.oneWayEnabled ?? v.one_way_enabled,
    ownerId: v.ownerId ?? v.owner_id ?? null,
    ownerAuthId: v.ownerAuthId ?? v.owner_auth_id ?? null,
  };
}

async function fetchAdminVehicleList() {
  const res = await fetch('/api/admin/vehicles?status=all&_=' + Date.now(), { cache: 'no-store' });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(readableError(data?.error ?? data?.message ?? res.status));
  return Array.isArray(data) ? data.map(adminVehicleFromRow) : [];
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminApp() {
  const { state, dispatch } = useApp();
  const { adminTab, theme, currentUser } = state;
  const { t } = useI18n();
  const adminLightMode = isLightThemeBg(theme?.pageBg);

  const setTab = (v) => dispatch({ type: 'SET_ADMIN_TAB', v });

  const visibleTabs = currentUser?.isMaster ? MASTER_TAB_DEFS : ADMIN_TAB_DEFS;
  const renderedAdminTab = currentUser?.isMaster && adminTab === 'dashboard' ? 'master' : adminTab;
  const sideRailStyle = currentUser?.isMaster
    ? { background: 'linear-gradient(180deg, #050608 0%, #111827 58%, #201006 100%)' }
    : { background: theme.headerBg };
  const activeTabStyle = currentUser?.isMaster
    ? { background: 'linear-gradient(90deg, #7f1d1d 0%, #b45309 55%, #0f766e 100%)' }
    : { background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` };

  // 未処理の振込申請件数（サイドバーのバッジ用）。タブ切替のたびに再取得して、
  // 処理後にバッジが即座に更新されるようにする。
  const [payoutPending, setPayoutPending] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/owners/payouts?all=1&status=pending')
      .then(r => r.json())
      .then(d => { if (!cancelled) setPayoutPending(Number(d?.pendingCount ?? (Array.isArray(d?.payouts) ? d.payouts.length : 0)) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adminTab]);

  const tabBadge = (tab) => (tab.id === 'payouts' && payoutPending > 0 ? payoutPending : 0);

  return (
    <div className={`${adminLightMode ? 'admin-readable-light' : ''} min-h-screen flex flex-col md:flex-row`} style={{ background: theme.pageBg }}>
      <AdminReadableLightStyles />
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-800 md:flex md:flex-col" style={sideRailStyle}>
        {/* Logo + lang switcher */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-800">
          <div className={`mb-1 text-xs font-black uppercase tracking-[0.2em] ${currentUser?.isMaster ? 'text-amber-300' : 'text-gray-500'}`}>
            {currentUser?.isMaster ? t('mst_sidebarTitle') : 'Admin Panel'}
          </div>
          <div className="text-white font-bold mb-3">{currentUser?.isMaster ? t('mst_rootAuthority') : theme.logoText}</div>
          {currentUser?.isMaster && (
            <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 shadow-lg shadow-black/20">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-200">{t('adx_masterBadge')}</div>
              <div className="truncate text-xs text-white">{currentUser.email}</div>
              <div className="mt-1 text-[11px] text-amber-100/70">{t('mst_sidebarSub')}</div>
            </div>
          )}
          <LanguageSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleTabs.map((tab, idx) => {
            const showGroup = currentUser?.isMaster && tab.group && (idx === 0 || visibleTabs[idx - 1]?.group !== tab.group);
            const active = renderedAdminTab === tab.id;
            return (
              <div key={tab.id}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/60">
                    {t(tab.group)}
                  </div>
                )}
                <button
                  onClick={() => setTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active ? 'text-white shadow-lg shadow-black/20' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                  style={active ? activeTabStyle : {}}
                >
                  <span>{tab.icon}</span> {t(tab.key)}
                  {tabBadge(tab) > 0 && (
                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{tabBadge(tab)}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {currentUser?.isMaster && (
          <div className="mx-4 mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
            <div className="font-bold">{t('mst_higherThanAdmin')}</div>
            <div className="mt-1 text-cyan-100/70">{t('mst_higherThanAdminSub')}</div>
          </div>
        )}

        <div className="p-4">
          <button
            onClick={() => dispatch({ type: 'SET_MODE', v: 'frontend' })}
            className={`w-full rounded-xl border py-2 text-xs transition-colors ${
              currentUser?.isMaster
                ? 'border-amber-600/40 text-amber-100/70 hover:bg-amber-500/10 hover:text-white'
                : 'border-gray-700 text-gray-500 hover:text-white'
            }`}
          >
            {t('backToSite')}
          </button>
        </div>
      </aside>

      <div className="md:hidden border-b border-gray-800 px-4 py-3" style={sideRailStyle}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-widest ${currentUser?.isMaster ? 'text-amber-300' : 'text-gray-500'}`}>
              {currentUser?.isMaster ? t('mst_sidebarTitle') : 'Admin Panel'}
            </div>
            <div className="text-white font-bold">{currentUser?.isMaster ? t('mst_rootAuthority') : theme.logoText}</div>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleTabs.map(tab => {
            const active = renderedAdminTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`min-w-max rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  active ? 'text-white' : 'bg-gray-900 text-gray-400'
                }`}
                style={active ? activeTabStyle : {}}
              >
                <span>{tab.icon}</span> {t(tab.key)}
                {tabBadge(tab) > 0 && (
                  <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{tabBadge(tab)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {renderedAdminTab === 'dashboard'    && <Dashboard />}
        {renderedAdminTab === 'vehicles'     && <VehiclesTab />}
        {renderedAdminTab === 'parking'      && <ParkingTab />}
        {renderedAdminTab === 'reservations' && <ReservationsTab />}
        {renderedAdminTab === 'owner-revenue' && <OwnerRevenueTab />}
        {renderedAdminTab === 'payouts'      && <PayoutsTab onPendingChange={setPayoutPending} />}
        {renderedAdminTab === 'users'        && <UsersTab />}
        {renderedAdminTab === 'reviews'      && <AdminReviews />}
        {renderedAdminTab === 'owners'       && <OwnersTab />}
        {renderedAdminTab === 'vehicle-approval' && <VehicleApprovalTab />}
        {renderedAdminTab === 'authorizations' && (currentUser?.isMaster ? <MasterAuthorizationsTab currentUser={currentUser} /> : <MasterLocked />)}
        {renderedAdminTab === 'banners'      && <BannerManager />}
        {renderedAdminTab === 'theme'        && <ThemeEditor />}
        {renderedAdminTab === 'pages'        && <LegalPagesEditor />}
        {renderedAdminTab === 'master'       && (currentUser?.isMaster ? <MasterTab /> : <MasterLocked />)}
      </main>
    </div>
  );
}

function ownerLookupMaps(owners) {
  return owners.reduce((acc, owner) => {
    if (owner.id) acc.byId[String(owner.id)] = owner;
    if (owner.user_id) acc.byId[String(owner.user_id)] = owner;
    return acc;
  }, { byId: {} });
}

function compactId(value) {
  return value ? String(value).slice(0, 8) + '...' : '';
}

function ownerPublicId(owner) {
  return owner?.owner_code ?? owner?.ownerCode ?? (owner?.id ? `OWN-${String(owner.id).slice(0, 8).toUpperCase()}` : 'OWN-UNKNOWN');
}

function reservationPaidAmount(reservation) {
  return Number(reservation?.stripePaidAmount ?? reservation?.stripe_paid_amount ?? reservation?.total ?? 0);
}

function platformFeePercent(owner) {
  return Number(owner?.platform_fee_percent ?? owner?.platformFeePercent ?? 15);
}

function vehicleIdOf(vehicle) {
  return vehicle?.id ?? vehicle?.vehicle_id ?? vehicle?.vehicleId ?? null;
}

function vehicleOwnerId(vehicle) {
  return vehicle?.ownerId ?? vehicle?.owner_id ?? vehicle?.ownerAuthId ?? vehicle?.owner_auth_id ?? null;
}

function reservationVehicleId(reservation) {
  return reservation?.vehicleId ?? reservation?.vehicle_id ?? null;
}

function reservationUserId(reservation) {
  return reservation?.userId ?? reservation?.user_id ?? null;
}

function reservationOwnerIdValue(reservation) {
  return reservation?.ownerId ?? reservation?.owner_id ?? null;
}

function reservationPickupAt(reservation) {
  return reservation?.pickup ?? reservation?.pickup_at ?? null;
}

function vehicleLabel(vehicle) {
  if (!vehicle) return '';
  const name = [vehicle.maker, vehicle.model].filter(Boolean).join(' ').trim();
  return name || compactId(vehicleIdOf(vehicle)) || 'Unknown vehicle';
}

function reservationOwnerId(reservation, vehicleById) {
  const vehicle = vehicleById[String(reservationVehicleId(reservation))];
  return reservationOwnerIdValue(reservation) ?? vehicleOwnerId(vehicle) ?? null;
}

function buildOwnerRevenueRows({ owners, vehicles, reservations }) {
  const { byId: ownerById } = ownerLookupMaps(owners);
  const vehicleById = Object.fromEntries(
    vehicles
      .map(vehicle => [String(vehicleIdOf(vehicle)), vehicle])
      .filter(([id]) => id && id !== 'null' && id !== 'undefined')
  );
  const rowsByOwner = {};

  owners.forEach(owner => {
    const key = String(owner.id ?? owner.user_id);
    const ownerKeys = [owner.id, owner.user_id].filter(Boolean).map(String);
    const ownerVehicles = vehicles.filter(vehicle => ownerKeys.includes(String(vehicleOwnerId(vehicle))));
    rowsByOwner[key] = {
      owner,
      ownerId: key,
      ownerCode: ownerPublicId(owner),
      platformFeePercent: platformFeePercent(owner),
      storeName: owner.store_name ?? 'Unknown owner',
      ownerName: owner.bank_account_holder ?? owner.name ?? '',
      ownerEmail: owner.email ?? '',
      ownerPhone: owner.phone ?? '',
      ownerLocation: owner.store_location ?? owner.location ?? '',
      status: owner.status ?? 'unknown',
      vehicleCount: ownerVehicles.length,
      vehicleNames: ownerVehicles.map(vehicleLabel),
      reservationCount: 0,
      pendingCount: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      totalRevenue: 0,
      confirmedRevenue: 0,
      monthRevenue: 0,
      platformFeeAmount: 0,
      ownerPayout: 0,
    };
  });

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  reservations.forEach(reservation => {
    const ownerId = reservationOwnerId(reservation, vehicleById);
    const owner = ownerId ? ownerById[String(ownerId)] : null;
    const key = String(owner?.id ?? owner?.user_id ?? ownerId ?? 'unassigned');
    const total = reservationPaidAmount(reservation);
    const status = reservation.status ?? 'pending';

    if (!rowsByOwner[key]) {
      const ownerKeys = owner ? [owner.id, owner.user_id].filter(Boolean).map(String) : [key];
      const ownerVehicles = vehicles.filter(vehicle => ownerKeys.includes(String(vehicleOwnerId(vehicle))));
      rowsByOwner[key] = {
        owner,
        ownerId: key,
        ownerCode: ownerPublicId(owner),
        platformFeePercent: platformFeePercent(owner),
        storeName: owner?.store_name ?? 'Unassigned',
        ownerName: owner?.bank_account_holder ?? owner?.name ?? '',
        ownerEmail: owner?.email ?? '',
        ownerPhone: owner?.phone ?? '',
        ownerLocation: owner?.store_location ?? owner?.location ?? '',
        status: owner?.status ?? 'unknown',
        vehicleCount: ownerVehicles.length,
        vehicleNames: ownerVehicles.map(vehicleLabel),
        reservationCount: 0,
        pendingCount: 0,
        confirmedCount: 0,
        cancelledCount: 0,
        totalRevenue: 0,
        confirmedRevenue: 0,
        monthRevenue: 0,
        platformFeeAmount: 0,
        ownerPayout: 0,
      };
    }

    rowsByOwner[key].reservationCount += 1;
    if (['pending', 'pending_assignment'].includes(status)) rowsByOwner[key].pendingCount += 1;
    if (status === 'cancelled') rowsByOwner[key].cancelledCount += 1;
    if (['confirmed', 'in_progress', 'completed'].includes(status)) {
      rowsByOwner[key].confirmedCount += 1;
      rowsByOwner[key].confirmedRevenue += total;
      const feeAmount = Math.round(total * (rowsByOwner[key].platformFeePercent / 100));
      rowsByOwner[key].platformFeeAmount += feeAmount;
      rowsByOwner[key].ownerPayout += total - feeAmount;
    }
    if (status !== 'cancelled') rowsByOwner[key].totalRevenue += total;

    const date = reservationPickupAt(reservation) ? new Date(reservationPickupAt(reservation)) : null;
    if (date && date.getMonth() === currentMonth && date.getFullYear() === currentYear && status !== 'cancelled') {
      rowsByOwner[key].monthRevenue += total;
    }
  });

  return Object.values(rowsByOwner).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function monthKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addRankItem(map, key, label, amount = 0) {
  const safeKey = String(key || label || 'unknown');
  const existing = map.get(safeKey) ?? { label: label || '未設定', count: 0, amount: 0 };
  map.set(safeKey, {
    ...existing,
    count: existing.count + 1,
    amount: existing.amount + Number(amount || 0),
  });
}

function rankRows(map, limit = 6) {
  return [...map.values()]
    .sort((a, b) => (b.amount - a.amount) || (b.count - a.count))
    .slice(0, limit);
}

function sortableTime(value) {
  const time = new Date(value ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function buildOwnerStoreGroups(owners, users) {
  const activeOwners = withoutMasterDeletedOwners(owners).filter(owner => owner?.status !== 'rejected');
  const ownerById = Object.fromEntries(activeOwners.filter(owner => owner?.id).map(owner => [String(owner.id), owner]));
  const userById = Object.fromEntries((users ?? []).filter(user => user?.id).map(user => [String(user.id), user]));
  const groups = new Map();

  const ensureGroup = (key, label, userEmail) => {
    const safeKey = String(key || label || 'unknown-owner');
    if (!groups.has(safeKey)) {
      groups.set(safeKey, {
        key: safeKey,
        label: label || '未紐付けオーナー',
        userEmail: userEmail || '',
        stores: [],
      });
    }
    return groups.get(safeKey);
  };

  activeOwners.forEach(owner => {
    const parent = owner?.parent_owner_id ? ownerById[String(owner.parent_owner_id)] : null;
    const ownerUserId = parent?.user_id ?? owner?.user_id;
    const user = ownerUserId ? userById[String(ownerUserId)] : null;
    const isAdditional = owner?.business_type === 'additional_store';
    const key = ownerUserId ?? parent?.id ?? owner?.email ?? owner?.id;
    const label = user?.email ?? parent?.email ?? owner?.email ?? parent?.applicant_name ?? owner?.applicant_name ?? owner?.store_name;
    const group = ensureGroup(key, label, user?.email ?? parent?.email ?? owner?.email);

    group.stores.push({
      id: owner?.id,
      name: owner?.store_name ?? owner?.applicant_name ?? '未設定店舗',
      type: isAdditional ? '追加店舗' : '親店舗',
      status: owner?.status ?? 'unknown',
      location: owner?.store_location ?? '',
      email: owner?.email ?? '',
    });
  });

  return [...groups.values()]
    .map(group => ({
      ...group,
      stores: group.stores.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ja') : (a.type === '親店舗' ? -1 : 1))),
    }))
    .sort((a, b) => (b.stores.length - a.stores.length) || a.label.localeCompare(b.label, 'ja'));
}

function buildMasterAnalytics({ owners, vehicles, reservations, users, payouts }) {
  const { byId: ownerById } = ownerLookupMaps(owners);
  const vehicleById = Object.fromEntries(
    vehicles
      .map(vehicle => [String(vehicleIdOf(vehicle)), vehicle])
      .filter(([id]) => id && id !== 'null' && id !== 'undefined')
  );
  const userById = Object.fromEntries((users ?? []).map(user => [String(user.id), user]));
  const now = new Date();
  const monthlyKeys = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return monthKey(d);
  });
  const monthlyRevenue = monthlyKeys.map(key => ({ label: key, value: 0, count: 0 }));
  const monthlyByKey = Object.fromEntries(monthlyRevenue.map(row => [row.label, row]));
  const vehicleClassDemand = new Map();
  const topStoreDemand = new Map();
  const topVehicleDemand = new Map();
  const userDemand = new Map();
  const statusDemand = new Map();

  const ledgerSource = (reservations ?? [])
    .map(reservation => {
      const vehicle = vehicleById[String(reservationVehicleId(reservation))];
      const ownerId = reservationOwnerId(reservation, vehicleById);
      const owner = ownerId ? ownerById[String(ownerId)] : null;
      const user = userById[String(reservationUserId(reservation))];
      const amount = reservationPaidAmount(reservation);
      const status = reservation.status ?? 'unknown';
      const pickupDate = reservationPickupAt(reservation) ? new Date(reservationPickupAt(reservation)) : null;
      const key = monthKey(pickupDate);
      const isCancelled = status === 'cancelled';
      if (monthlyByKey[key] && !isCancelled) {
        monthlyByKey[key].value += amount;
        monthlyByKey[key].count += 1;
      }
      addRankItem(statusDemand, status, status, amount);
      if (!isCancelled) {
        const cls = normalizeVehicleClass(vehicle?.cls ?? reservation?.targetClass ?? reservation?.target_class ?? reservation?.type ?? 'unknown');
        const clsLabel = VEHICLE_CLASSES.find(option => option.id === cls)?.ja ?? cls;
        addRankItem(vehicleClassDemand, cls, clsLabel, amount);
        addRankItem(topStoreDemand, owner?.id ?? ownerId ?? 'unassigned', owner?.store_name ?? '未紐付け店舗', amount);
        addRankItem(topVehicleDemand, vehicleIdOf(vehicle) ?? reservation?.targetClass ?? 'class-booking', vehicle ? vehicleLabel(vehicle) : `${clsLabel}クラス`, amount);
        addRankItem(userDemand, user?.id ?? reservationUserId(reservation) ?? 'guest', user?.email ?? user?.name ?? reservationUserId(reservation) ?? 'ゲスト/未紐付け', amount);
      }
      return {
        id: reservation.id,
        pickup: reservationPickupAt(reservation),
        status,
        amount,
        userLabel: user?.email ?? user?.name ?? reservationUserId(reservation) ?? 'ゲスト/未紐付け',
        vehicleLabel: vehicle ? vehicleLabel(vehicle) : (reservation?.targetClass ? `${reservation.targetClass}クラス` : '未割当'),
        storeName: owner?.store_name ?? '未紐付け店舗',
      };
    });

  const reservationLedger = ledgerSource
    .sort((a, b) => sortableTime(b.pickup) - sortableTime(a.pickup))
    .slice(0, 20);
  const payoutFlow = {
    requested: (payouts ?? []).filter(p => ['pending', 'approved'].includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0),
    paid: (payouts ?? []).filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0),
  };

  return {
    monthlyRevenue,
    vehicleClassDemand: rankRows(vehicleClassDemand),
    topStoreDemand: rankRows(topStoreDemand),
    topVehicleDemand: rankRows(topVehicleDemand),
    userDemand: rankRows(userDemand),
    statusDemand: rankRows(statusDemand),
    reservationLedger,
    payoutFlow,
    ownerStoreGroups: buildOwnerStoreGroups(owners, users),
  };
}

function MasterBarChart({ title, rows, money }) {
  const max = Math.max(1, ...rows.map(row => Number(row.value || row.amount || row.count || 0)));
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-5 flex h-36 items-end gap-2">
        {rows.map(row => {
          const value = Number(row.value || row.amount || row.count || 0);
          return (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end rounded-xl bg-gray-950/80 p-1">
                <div
                  className="w-full rounded-lg bg-gradient-to-t from-purple-700 via-fuchsia-500 to-amber-300"
                  style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
                />
              </div>
              <div className="w-full text-center">
                <p className="truncate text-[10px] font-bold text-gray-300">{row.label}</p>
                <p className="truncate text-[10px] text-gray-500">{money ? money(value) : value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MasterRankList({ title, rows, money }) {
  const max = Math.max(1, ...rows.map(row => Number(row.amount || row.count || 0)));
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : rows.map((row, index) => {
          const value = Number(row.amount || row.count || 0);
          return (
            <div key={`${title}-${row.label}-${index}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-bold text-gray-200">{index + 1}. {row.label}</span>
                <span className="shrink-0 text-gray-500">{row.count}件 · {money ? money(row.amount) : row.amount}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-950">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${Math.max(6, (value / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MasterReservationLedger({ rows, money }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white">誰がどの車を予約したか</h3>
          <p className="mt-1 text-xs text-gray-500">広告・おすすめ用データとして、ユーザー/店舗/車両/金額を横断確認します。</p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-100">マスター専用</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500">
              <th className="py-2 pr-3">ユーザー</th>
              <th className="py-2 pr-3">車両</th>
              <th className="py-2 pr-3">店舗</th>
              <th className="py-2 pr-3">受取日</th>
              <th className="py-2 pr-3">状態</th>
              <th className="py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-gray-800/70 text-gray-300">
                <td className="py-2 pr-3 font-semibold text-white">{row.userLabel}</td>
                <td className="py-2 pr-3">{row.vehicleLabel}</td>
                <td className="py-2 pr-3">{row.storeName}</td>
                <td className="py-2 pr-3">{row.pickup ? String(row.pickup).slice(0, 10) : '—'}</td>
                <td className="py-2 pr-3">{row.status}</td>
                <td className="py-2 text-right font-bold text-emerald-300">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MasterOwnerStoreMatrix({ groups, onDeleteStore, canDelete, deletingStoreId }) {
  return (
    <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-950 p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">OWNER STORE MAP</div>
          <h3 className="mt-1 text-xl font-black text-white">オーナー別 店舗一覧</h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            どのオーナーがどんな店舗を持っているか、親店舗と追加店舗をまとめて確認できます。
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-100">
          {groups.length}オーナー
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-6 text-center text-sm text-gray-500">店舗データがありません</p>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.key} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{group.label}</p>
                  {group.userEmail && <p className="mt-0.5 truncate text-xs text-gray-500">{group.userEmail}</p>}
                </div>
                <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-100">
                  {group.stores.length}店舗
                </span>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {group.stores.map(store => (
                  <div key={store.id ?? store.name} className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${store.type === '親店舗' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-purple-500/10 text-purple-200'}`}>
                        {store.type}
                      </span>
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-bold text-gray-300">{store.status}</span>
                      {canDelete && store.type === '追加店舗' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteStore?.(store);
                          }}
                          disabled={deletingStoreId === store.id}
                          className="ml-auto rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {deletingStoreId === store.id ? '処理中' : '削除'}
                        </button>
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-white">{store.name}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{[store.location, store.email].filter(Boolean).join(' / ') || '詳細未設定'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const { state, dispatch } = useApp();
  const { vehicles, reservations, users } = state;
  const { t } = useI18n();
  const [pendingVehicles, setPendingVehicles] = useState(0);
  const [pendingOwners, setPendingOwners] = useState(0);

  // Surface anything awaiting the admin's review, so approvals are never missed.
  useEffect(() => {
    fetch('/api/admin/vehicles?status=pending')
      .then(r => r.json())
      .then(d => setPendingVehicles(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    fetchOwnersList()
      .then(d => setPendingOwners(d.filter(o => (o.status ?? o.approval_status) === 'pending').length))
      .catch(() => {});
  }, []);

  const goTab = (v) => dispatch({ type: 'SET_ADMIN_TAB', v });
  const totalRev = reservations.filter(r => r.status !== 'cancelled').reduce((s, r) => s + r.total, 0);
  const stats = [
    { label: 'Total Revenue', value: `¥${totalRev.toLocaleString()}`, icon: '💰' },
    { label: t('vehicles'),   value: vehicles.length,                 icon: '🚗' },
    { label: t('reservations'),value: reservations.length,            icon: '📋' },
    { label: t('users'),      value: users.length,                    icon: '👥' },
  ];
  const hasPending = pendingVehicles > 0 || pendingOwners > 0;
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">{t('dashboard')}</h1>

      {/* ── Action needed: pending approvals ─────────────────────── */}
      <div className={`mb-8 rounded-2xl border p-5 ${hasPending ? 'border-amber-600/50 bg-amber-900/20' : 'border-gray-800 bg-gray-900'}`}>
        <p className={`text-sm font-bold mb-3 ${hasPending ? 'text-amber-300' : 'text-gray-400'}`}>
          {hasPending ? `⚠️ ${t('adActionNeeded')}` : `✓ ${t('adAllClear')}`}
        </p>
        {hasPending && (
          <div className="flex flex-wrap gap-3">
            {pendingVehicles > 0 && (
              <button
                onClick={() => goTab('vehicle-approval')}
                className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-500"
              >
                🔍 {t('adPendingVehicles').replace('{n}', pendingVehicles)} · {t('adReview')}
              </button>
            )}
            {pendingOwners > 0 && (
              <button
                onClick={() => goTab('owners')}
                className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-500"
              >
                🏪 {t('adPendingOwners').replace('{n}', pendingOwners)} · {t('adReview')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-gray-400 text-sm">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">{t('reservations')}</h2>
        <ReservationTable reservations={reservations.slice(0, 5)} />
      </div>
    </div>
  );
}

// ── Owner Revenue ─────────────────────────────────────────────────────────────
// ── Master（開発者）専用タブ ─────────────────────────────────────────────────
function MasterLocked() {
  const { t } = useI18n();
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <p className="text-white font-bold">{t('mst_onlyMaster')}</p>
      <p className="text-gray-500 text-sm mt-1">{MASTER_EMAIL}</p>
    </div>
  );
}

function MasterStat({ label, value, sub, accent }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-[11px] mt-1">{sub}</p>}
    </div>
  );
}

function adminUsersFromPayload(data) {
  return Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
}

function adminUsersErrorText(data, res) {
  return data?.error || data?.message || `HTTP ${res.status}`;
}

function readableError(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.message === 'string') return value.message;
  if (typeof value?.error === 'string') return value.error;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function vehicleDeleteErrorText(data, res, t) {
  if (data?.code === 'active_reservations') return t('od_deleteBlockedActive');
  return readableError(data?.error ?? data?.message ?? res.status);
}

function formatLoadedAt(date) {
  return date ? date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

async function masterAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('マスターセッションを確認できません。再ログインしてください。');
  return token;
}

async function masterSessionHeaders(extraHeaders = {}) {
  const token = await masterAccessToken();
  return { ...extraHeaders, Authorization: `Bearer ${token}` };
}

function MasterAuthorizationManager({ currentUser, money }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authActionAmounts, setAuthActionAmounts] = useState({});
  const [processing, setProcessing] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/authorizations?requesterId=${encodeURIComponent(currentUser.id)}&_=${Date.now()}`, {
        cache: 'no-store',
        headers: await masterSessionHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'authorization list failed');
      const nextRows = Array.isArray(data?.reservations) ? data.reservations : [];
      setRows(nextRows);
      setAuthActionAmounts(prev => Object.fromEntries(nextRows.map(row => [
        row.id,
        prev[row.id] ?? String(Math.max(0, Number(row.amountCapturable || row.total || row.stripePaidAmount || 0))),
      ])));
    } catch (error) {
      setRows([]);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (row, action) => {
    const amount = Math.round(Number(authActionAmounts[row.id] ?? 0));
    if (action !== 'release' && (!Number.isFinite(amount) || amount < 50)) {
      setMessage('請求額は50円以上で入力してください。');
      return;
    }
    const label = action === 'release' ? '解放' : (row.stripePaymentIntentId ? '請求・キャプチャ' : '¥0カード請求');
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(`${label}を実行しますか？\n\n予約ID: ${row.id}\n金額: ${action === 'release' ? '¥0' : money(amount)}`);
    if (!ok) return;

    setProcessing(`${row.id}:${action}`);
    setMessage('');
    try {
      const res = await fetch('/api/admin/authorizations', {
        method: 'POST',
        headers: await masterSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          requesterId: currentUser?.id,
          reservationId: row.id,
          action,
          amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `${label} failed`);
      setMessage(`${label}を実行しました。`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setProcessing('');
    }
  };

  const statusClass = status => {
    const s = String(status ?? '').toLowerCase();
    if (s === 'authorized') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100';
    if (s === 'scheduled') return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
    if (s === 'paid') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100';
    if (s === 'released') return 'border-gray-600 bg-gray-800 text-gray-300';
    return 'border-purple-500/40 bg-purple-500/10 text-purple-100';
  };

  return (
    <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-950 p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">AUTHORIZATION CONTROL</div>
          <h3 className="mt-1 text-xl font-black text-white">オーソリ管理</h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            通常オーソリは金額を指定してキャプチャまたは解放できます。¥0カード登録は入力した金額を請求できます。
          </p>
        </div>
        <button onClick={load} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-cyan-500 hover:text-white">
          更新
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
          {message}
        </div>
      )}

      {loading ? (
        <p className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-6 text-center text-sm text-gray-500">読み込み中...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-6 text-center text-sm text-gray-500">操作可能なオーソリはありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="py-2 pr-3">予約</th>
                <th className="py-2 pr-3">店舗 / 車両</th>
                <th className="py-2 pr-3">利用者</th>
                <th className="py-2 pr-3">状態</th>
                <th className="py-2 pr-3 text-right">予約額</th>
                <th className="py-2 pr-3">請求額</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map(row => {
                const normalizedPaymentStatus = String(row.paymentStatus ?? '').toLowerCase();
                const hasHold = Boolean(row.stripePaymentIntentId && normalizedPaymentStatus === 'authorized');
                const canReleaseHold = Boolean(row.stripePaymentIntentId && ['authorized', 'release_required'].includes(normalizedPaymentStatus));
                const canChargeSavedCard = Boolean(row.stripeCustomerId && row.stripePaymentMethodId);
                const action = hasHold ? 'capture' : 'charge';
                const chargeLabel = hasHold ? '請求・キャプチャ' : '¥0カード請求';
                const busyCharge = processing === `${row.id}:${action}`;
                const busyRelease = processing === `${row.id}:release`;
                return (
                  <tr key={row.id} className="align-top text-gray-300">
                    <td className="py-3 pr-3">
                      <p className="font-mono text-[11px] text-gray-500">{row.id}</p>
                      <p className="mt-1 text-gray-500">{String(row.pickup ?? '').slice(0, 10)} → {String(row.ret ?? '').slice(0, 10)}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-bold text-white">{row.storeName}</p>
                      <p className="mt-1 text-gray-500">{row.vehicleName}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-gray-200">{row.guestName || '未設定'}</p>
                      <p className="mt-1 text-gray-500">{row.guestEmail || 'メール未設定'}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`rounded-full border px-2 py-0.5 font-bold ${statusClass(row.paymentStatus)}`}>
                          {row.paymentStatus ?? 'none'}
                        </span>
                        {row.preauthMode === 'zero' && (
                          <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-bold text-purple-100">¥0カード</span>
                        )}
                        {hasHold && row.amountCapturable > 0 && (
                          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-bold text-cyan-100">
                            可能 {money(row.amountCapturable)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono font-bold text-white">{money(row.total)}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="50"
                          step="1"
                          value={authActionAmounts[row.id] ?? ''}
                          onChange={event => setAuthActionAmounts(prev => ({ ...prev, [row.id]: event.target.value }))}
                          className="w-28 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-right font-mono text-sm text-white focus:border-cyan-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setAuthActionAmounts(prev => ({ ...prev, [row.id]: String(Math.max(50, Number(row.amountCapturable || row.total || 50))) }))}
                          className="rounded-lg border border-gray-700 px-2 py-1.5 text-[11px] font-bold text-gray-300 hover:text-white"
                        >
                          全額
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={busyCharge || (!hasHold && !canChargeSavedCard)}
                          onClick={() => runAction(row, action)}
                          className="rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white transition-colors hover:bg-cyan-500 disabled:opacity-40"
                        >
                          {busyCharge ? '処理中' : chargeLabel}
                        </button>
                        <button
                          disabled={busyRelease || !canReleaseHold}
                          onClick={() => runAction(row, 'release')}
                          className="rounded-lg border border-red-500/50 px-3 py-1.5 font-bold text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                        >
                          {busyRelease ? '処理中' : '解放'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MasterAuthorizationsTab({ currentUser }) {
  const money = value => `¥${Math.round(Number(value ?? 0)).toLocaleString()}`;
  return (
    <div>
      <MasterAuthorizationManager currentUser={currentUser} money={money} />
    </div>
  );
}

function MasterTab() {
  const { t } = useI18n();
  const { state, dispatch } = useApp();
  const { vehicles, reservations, currentUser } = state;
  const [owners, setOwners]   = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [users, setUsers]     = useState([]);
  const [adminVehicles, setAdminVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [savingId, setSavingId] = useState(null);
  const [deletingStoreId, setDeletingStoreId] = useState(null);
  const [userLoadError, setUserLoadError] = useState('');
  const [usersLoadedAt, setUsersLoadedAt] = useState(null);

  const load = async () => {
    if (!currentUser?.id) {
      setLoading(false);
      setUserLoadError(t('adx_masterSessionLoading'));
      return;
    }
    setLoading(true);
    try {
      const [oRes, pRes, vRes] = await Promise.all([
        fetchOwnersList().catch(() => []),
        fetch('/api/owners/payouts?all=1').then(r => r.json()).catch(() => ({ payouts: [] })),
        fetchAdminVehicleList().catch(() => []),
      ]);
      setOwners(Array.isArray(oRes) ? oRes.filter(owner => !isMasterDeletedOwner(owner)) : []);
      setPayouts(Array.isArray(pRes?.payouts) ? pRes.payouts : []);
      setAdminVehicles(Array.isArray(vRes) ? vRes : []);

      const res = await fetch(`/api/admin/users?requesterId=${encodeURIComponent(currentUser?.id ?? '')}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUserLoadError(adminUsersErrorText(data, res));
        setUsers([]);
        return;
      }
      setUsers(adminUsersFromPayload(data));
      setUsersLoadedAt(new Date());
      setUserLoadError('');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [currentUser?.id]);

  const setRole = async (userId, role) => {
    setSavingId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, userId, role }),
      });
      if (!res.ok) throw new Error('failed');
      await load();
    } catch (e) {
      console.error('[MasterTab] setRole failed:', e.message);
    } finally {
      setSavingId(null);
    }
  };

  async function deleteAdditionalStore(store) {
    if (!store?.id || !currentUser?.isMaster) return;
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(`追加店舗を削除しますか？\n\n${store.name ?? store.store_name ?? store.id}\n\n過去の予約・売上履歴は残し、オーナー側の店舗切替からは消えます。`);
    if (!ok) return;

    setDeletingStoreId(store.id);
    try {
      const res = await fetch('/api/owners', {
        method: 'DELETE',
        headers: await masterSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requesterId: currentUser?.id, id: store.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'delete failed');
      setOwners(prev => prev.filter(candidate => String(candidate?.id) !== String(store.id)));
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingStoreId(null);
    }
  }

  const money = v => `¥${Math.round(Number(v ?? 0)).toLocaleString()}`;
  const masterVehicles = adminVehicles.length > 0 ? adminVehicles : vehicles;
  const analytics = buildMasterAnalytics({ owners, vehicles: masterVehicles, reservations, users, payouts });

  // ── 費用・コスト集計（既存データから算出）────────────────────────────────
  const rows = buildOwnerRevenueRows({ owners, vehicles: masterVehicles, reservations });
  const grossPaid = rows.reduce((s, r) => s + Number(r.confirmedRevenue || 0), 0);
  const feeIncome = rows.reduce((s, r) => s + Number(r.platformFeeAmount || 0), 0);
  const ownerShare = rows.reduce((s, r) => s + Number(r.ownerPayout || 0), 0);
  const refundTotal = reservations
    .filter(r => (r.status ?? '') === 'cancelled')
    .reduce((s, r) => s + reservationPaidAmount(r), 0);
  const payoutRequested = payouts
    .filter(p => ['pending', 'approved'].includes(p.status))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const payoutPaid = payouts
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.email ?? '').toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q);
  });
  const openTab = (tab) => dispatch({ type: 'SET_ADMIN_TAB', v: tab });
  const authorityCards = [
    { title: t('mst_accountRoot'), body: t('mst_accountRootDesc'), value: users.length, tone: 'border-amber-500/40 bg-amber-500/10 text-amber-100' },
    { title: t('mst_storeAuthority'), body: t('mst_storeAuthorityDesc'), value: owners.length, tone: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100' },
    { title: t('mst_financeAuthority'), body: t('mst_financeAuthorityDesc'), value: money(feeIncome), tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' },
    { title: t('mst_auditControl'), body: t('mst_auditControlDesc'), value: reservations.length, tone: 'border-red-500/40 bg-red-500/10 text-red-100' },
  ];
  const commandTiles = [
    { tab: 'users', label: t('mst_accountRoot'), sub: t('mst_cmdUsers'), value: users.length },
    { tab: 'owners', label: t('mst_storeAuthority'), sub: t('mst_cmdStores'), value: owners.length },
    { tab: 'authorizations', label: t('mst_navAuthorizations'), sub: t('mst_cmdAuthorizations'), value: 'AUTH' },
    { tab: 'payouts', label: t('mst_financeAuthority'), sub: t('mst_cmdPayouts'), value: money(payoutRequested) },
    { tab: 'reviews', label: t('mst_auditControl'), sub: t('mst_cmdAudit'), value: reservations.length },
  ];

  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gray-950 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-800 px-5 py-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">{t('adx_masterBadge')}</div>
            <h2 className="mt-1 text-3xl font-black">★ {t('mst_title')}</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-400">{t('mst_subtitle')} · {MASTER_EMAIL}</p>
            <div className="mt-3 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-100">
              {t('mst_higherThanAdmin')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-lg border px-3 py-2 ${userLoadError ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
              {userLoadError ? t('adx_apiError') : t('adx_apiOk')}
            </span>
            <span className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300">{t('adx_loadedAt')}: {formatLoadedAt(usersLoadedAt)}</span>
            <button onClick={load} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 transition-colors hover:border-purple-500 hover:text-white">{t('ad_refreshBtn')}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-800 md:grid-cols-4">
          {[
            [t('mst_users'), users.length],
            [t('mst_owners'), owners.length],
            [t('mst_vehicles'), masterVehicles.length],
            [t('reservations'), reservations.length],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-950 px-5 py-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-950 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-white">{t('mst_authorityTitle')}</h3>
            <p className="mt-1 text-sm text-gray-500">{t('mst_authorityDesc')}</p>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-100">{t('mst_rootAuthority')}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {authorityCards.map(card => (
            <div key={card.title} className={`rounded-2xl border p-4 ${card.tone}`}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">{card.title}</p>
              <p className="mt-3 text-2xl font-black text-white">{card.value}</p>
              <p className="mt-2 text-xs leading-5 opacity-80">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {commandTiles.map(tile => (
          <button
            key={tile.tab}
            onClick={() => openTab(tile.tab)}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-left transition-all hover:border-amber-500/50 hover:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">{tile.label}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{tile.sub}</p>
              </div>
              <span className="rounded-lg bg-gray-950 px-2 py-1 text-xs font-bold text-amber-200">{tile.value}</span>
            </div>
          </button>
        ))}
      </section>

      <MasterOwnerStoreMatrix
        groups={analytics.ownerStoreGroups}
        onDeleteStore={deleteAdditionalStore}
        canDelete={currentUser?.isMaster}
        deletingStoreId={deletingStoreId}
      />

      {/* 費用・コスト */}
      <h3 className="text-white font-bold text-sm mb-3">💴 {t('mst_finance')}</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <MasterStat label={t('mst_grossPaid')}       value={money(grossPaid)} />
        <MasterStat label={t('mst_feeIncome')}       value={money(feeIncome)}  accent="text-emerald-300" sub={t('mst_feeIncomeSub')} />
        <MasterStat label={t('mst_ownerShare')}      value={money(ownerShare)} />
        <MasterStat label={t('mst_payoutRequested')} value={money(payoutRequested)} accent="text-amber-300" />
        <MasterStat label={t('mst_payoutPaid')}      value={money(payoutPaid)} />
        <MasterStat label={t('mst_refunds')}         value={money(refundTotal)} accent="text-red-300" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <MasterStat label={t('mst_vehicles')} value={masterVehicles.length} />
        <MasterStat label={t('mst_owners')}   value={owners.length} />
        <MasterStat label={t('mst_users')}    value={users.length} />
      </div>

      <MasterAuthorizationManager currentUser={currentUser} money={money} />

      <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-950 p-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">MARKETING INTELLIGENCE</div>
            <h3 className="mt-1 text-xl font-black text-white">広告・おすすめ用データ</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              取引やお金の動き、どんなユーザーがどんな車を予約したかを見て、広告・おすすめ・店舗支援に使えます。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">振込済み {money(analytics.payoutFlow.paid)}</span>
            <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">未処理 {money(analytics.payoutFlow.requested)}</span>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <MasterBarChart title="月別の取扱高" rows={analytics.monthlyRevenue} money={money} />
          <MasterRankList title="車種別の予約需要" rows={analytics.vehicleClassDemand} money={money} />
          <MasterRankList title="店舗別の予約/売上ランキング" rows={analytics.topStoreDemand} money={money} />
          <MasterRankList title="車両別の予約/売上ランキング" rows={analytics.topVehicleDemand} money={money} />
          <MasterRankList title="ユーザー傾向" rows={analytics.userDemand} money={money} />
          <MasterRankList title="予約ステータス別の動き" rows={analytics.statusDemand} money={money} />
        </div>
        <div className="mt-4">
          <MasterReservationLedger rows={analytics.reservationLedger} money={money} />
        </div>
      </section>

      {/* 役割管理 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-sm">🔑 {t('mst_roleMgmt')}</h3>
        <button onClick={load} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5">↻</button>
      </div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('mst_searchUser')}
        className="w-full mb-3 bg-gray-900 border border-gray-700 text-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-purple-500"
      />
      {userLoadError && (
        <div className="mb-3 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-100">
          <div className="font-bold">{t('adx_userLoadFailed')}</div>
          <div className="mt-1 break-all text-xs text-red-200/80">{userLoadError}</div>
          <button onClick={load} className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-bold text-red-100 hover:bg-red-500/10">{t('ad_refreshBtn')}</button>
        </div>
      )}
      {loading ? (
        <p className="text-gray-500 text-sm">…</p>
      ) : userLoadError ? null : (
        <div className="space-y-2">
          {filteredUsers.slice(0, 100).map(u => (
            <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{u.name || (u.email ?? '').split('@')[0]}</p>
                <p className="text-gray-500 text-xs truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {['user', 'owner', 'admin'].map(r => (
                  <button
                    key={r}
                    disabled={savingId === u.id}
                    onClick={() => setRole(u.id, r)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50 ${
                      (u.role ?? 'user') === r ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 振込申請（Payouts）タブ ──────────────────────────────────────────────────
function PayoutStatusChip({ status, t }) {
  const cls = {
    pending:  'bg-yellow-900/40 text-yellow-300 border-yellow-700/40',
    approved: 'bg-sky-900/40 text-sky-300 border-sky-700/40',
    paid:     'bg-green-900/40 text-green-300 border-green-700/40',
    rejected: 'bg-red-900/40 text-red-300 border-red-700/40',
  }[status] ?? 'bg-gray-800 text-gray-400 border-gray-700';
  const label = {
    pending: t('po_statusPending'), approved: t('po_statusApproved'),
    paid: t('po_statusPaid'), rejected: t('po_statusRejected'),
  }[status] ?? status;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>{label}</span>;
}

function PayoutsTab({ onPendingChange }) {
  const { t } = useI18n();
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [processingId, setProcessingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/owners/payouts?all=1');
      const data = await res.json();
      const list = Array.isArray(data?.payouts) ? data.payouts : [];
      setPayouts(list);
      onPendingChange?.(Number(data?.pendingCount ?? list.filter(p => p.status === 'pending').length) || 0);
    } catch {
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const updateStatus = async (id, status, adminNote) => {
    setProcessingId(id);
    try {
      const res = await fetch('/api/owners/payouts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, adminNote }),
      });
      if (!res.ok) throw new Error('update failed');
      await load();
    } catch (e) {
      console.error('[PayoutsTab] update failed:', e.message);
    } finally {
      setProcessingId(null);
    }
  };

  const reject = (id) => {
    const reason = typeof window !== 'undefined' ? window.prompt(t('po_adminRejectPrompt')) : '';
    if (reason === null) return; // cancelled
    updateStatus(id, 'rejected', reason || undefined);
  };

  const money = v => `¥${Number(v ?? 0).toLocaleString()}`;
  const FILTERS = ['pending', 'approved', 'paid', 'rejected', 'all'];
  const filterLabel = (f) => f === 'all' ? t('po_adminAll')
    : ({ pending: t('po_statusPending'), approved: t('po_statusApproved'), paid: t('po_statusPaid'), rejected: t('po_statusRejected') }[f]);
  const rows = filter === 'all' ? payouts : payouts.filter(p => p.status === filter);
  const pendingTotal = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">💸 {t('po_adminTab')}</h2>
          <p className="text-gray-500 text-sm mt-1">
            {t('po_adminPending')}: <span className="text-amber-300 font-bold">{payouts.filter(p => p.status === 'pending').length}</span>
            <span className="text-gray-600"> · {money(pendingTotal)}</span>
          </p>
        </div>
        <button onClick={load} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5">↻</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              filter === f ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            {filterLabel(f)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">…</p>
      ) : rows.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">{t('po_adminNone')}</div>
      ) : (
        <div className="space-y-3">
          {rows.map(p => {
            const owner = p.owner ?? {};
            const bank = [p.bank_name, p.bank_branch].filter(Boolean).join(' ');
            const acct = [p.bank_account_type, p.bank_account_number].filter(Boolean).join(' ');
            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold">{owner.store_name ?? owner.owner_code ?? p.owner_id}</span>
                      <PayoutStatusChip status={p.status} t={t} />
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {owner.owner_code ? `${owner.owner_code} · ` : ''}{owner.email ?? ''}
                    </p>
                    <p className="text-gray-400 text-xs mt-2">
                      <span className="text-gray-500">{t('po_adminBank')}:</span> {bank || '—'} / {acct || '—'} {p.bank_account_holder ? `(${p.bank_account_holder})` : ''}
                    </p>
                    <p className="text-gray-600 text-[11px] mt-1">
                      {t('po_adminDate')}: {new Date(p.created_at).toLocaleString()}
                    </p>
                    {p.admin_note && <p className="text-gray-500 text-[11px] mt-1">📝 {p.admin_note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-[11px]">{t('po_adminAmount')}</p>
                    <p className="text-2xl font-bold text-white">{money(p.amount)}</p>
                  </div>
                </div>

                {(p.status === 'pending' || p.status === 'approved') && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-800 pt-3">
                    {p.status === 'pending' && (
                      <button disabled={processingId === p.id} onClick={() => updateStatus(p.id, 'approved')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50">
                        {t('po_adminApprove')}
                      </button>
                    )}
                    <button disabled={processingId === p.id} onClick={() => updateStatus(p.id, 'paid')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                      {t('po_adminMarkPaid')}
                    </button>
                    <button disabled={processingId === p.id} onClick={() => reject(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-700/50 text-red-300 hover:bg-red-900/30 disabled:opacity-50">
                      {t('po_adminReject')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OwnerRevenueTab() {
  const { t } = useI18n();
  const { state } = useApp();
  const { vehicles, reservations, theme } = state;
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchOwnersList();
      setOwners(Array.isArray(data) ? data : []);
    } catch {
      setOwners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = buildOwnerRevenueRows({ owners, vehicles, reservations });
  const filteredRows = filter === 'all' ? rows : rows.filter(row => row.status === filter);
  const summary = filteredRows.reduce((acc, row) => ({
    reservations: acc.reservations + row.reservationCount,
    totalRevenue: acc.totalRevenue + row.totalRevenue,
    confirmedRevenue: acc.confirmedRevenue + row.confirmedRevenue,
    monthRevenue: acc.monthRevenue + row.monthRevenue,
  }), { reservations: 0, totalRevenue: 0, confirmedRevenue: 0, monthRevenue: 0 });

  const statusClass = {
    approved: 'bg-green-900/40 text-green-300 border-green-700/40',
    pending: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40',
    rejected: 'bg-red-900/40 text-red-300 border-red-700/40',
    unknown: 'bg-gray-800 text-gray-400 border-gray-700',
  };

  const money = value => `¥${Number(value ?? 0).toLocaleString()}`;
  const saveOwnerFee = async (row, value) => {
    if (!row.owner?.id) return;
    const fee = Number(value);
    if (!Number.isFinite(fee) || fee < 0 || fee > 80) {
      alert(t('adx_feeRange'));
      return;
    }
    const res = await fetch('/api/owners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.owner.id, platformFeePercent: fee }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      alert(json?.error ?? t('adx_feeSaveFailed'));
      return;
    }
    await load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('adx_ownerRevTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('adx_ownerRevDesc')}</p>
        </div>
        <button onClick={load} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors">
          {t('ar_refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Reservations', value: summary.reservations.toLocaleString() },
          { label: 'Total Revenue', value: money(summary.totalRevenue) },
          { label: 'Confirmed Revenue', value: money(summary.confirmedRevenue) },
          { label: 'This Month', value: money(summary.monthRevenue) },
          { label: 'Platform Fee', value: money(filteredRows.reduce((s, r) => s + r.platformFeeAmount, 0)) },
          { label: 'Owner Payout', value: money(filteredRows.reduce((s, r) => s + r.ownerPayout, 0)) },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-500 text-xs mb-2">{card.label}</p>
            <p className="text-white text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-5">
        {['all', 'approved', 'pending', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filter === status ? 'text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
            style={filter === status ? { background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` } : {}}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        {loading ? (
          <p className="text-gray-500 text-sm text-center py-10">{t('o_loading')}</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10">{t('adx_noOwners')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-3 font-medium">Owner ID</th>
                  <th className="pb-3 font-medium">Owner / Store</th>
                  <th className="pb-3 font-medium">Vehicles</th>
                  <th className="pb-3 font-medium">Reservations</th>
                  <th className="pb-3 font-medium">Pending</th>
                  <th className="pb-3 font-medium">Confirmed</th>
                  <th className="pb-3 font-medium">Cancelled</th>
                  <th className="pb-3 font-medium">Total Revenue</th>
                  <th className="pb-3 font-medium">Confirmed Revenue</th>
                  <th className="pb-3 font-medium">This Month</th>
                  <th className="pb-3 font-medium">Fee %</th>
                  <th className="pb-3 font-medium">Platform Fee</th>
                  <th className="pb-3 font-medium">Owner Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredRows.map(row => (
                  <tr key={row.ownerId} className="text-gray-300">
                    <td className="py-3 text-xs font-mono text-purple-300">{row.ownerCode}</td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-white font-semibold">{row.storeName}</span>
                        {row.ownerName && <span className="text-xs text-gray-400">{row.ownerName}</span>}
                        {(row.ownerEmail || row.ownerLocation) && (
                          <span className="text-xs text-gray-500">
                            {[row.ownerLocation, row.ownerEmail].filter(Boolean).join(' / ')}
                          </span>
                        )}
                        <span className={`w-fit text-xs px-2 py-0.5 rounded-full border ${statusClass[row.status] ?? statusClass.unknown}`}>
                          {row.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="text-white font-semibold">{row.vehicleCount}</div>
                      {row.vehicleNames?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 max-w-xs">
                          {row.vehicleNames.slice(0, 4).map((name, index) => (
                            <span key={`${row.ownerId}-${name}-${index}`} className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                              {name}
                            </span>
                          ))}
                          {row.vehicleNames.length > 4 && (
                            <span className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-500">
                              +{row.vehicleNames.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-white font-semibold">{row.reservationCount}</td>
                    <td className="py-3 text-yellow-300">{row.pendingCount}</td>
                    <td className="py-3 text-green-300">{row.confirmedCount}</td>
                    <td className="py-3 text-red-300">{row.cancelledCount}</td>
                    <td className="py-3 text-white font-mono font-bold">{money(row.totalRevenue)}</td>
                    <td className="py-3 text-green-300 font-mono font-bold">{money(row.confirmedRevenue)}</td>
                    <td className="py-3 text-purple-300 font-mono font-bold">{money(row.monthRevenue)}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        min="0"
                        max="80"
                        step="0.1"
                        defaultValue={row.platformFeePercent}
                        onBlur={e => saveOwnerFee(row, e.target.value)}
                        className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-right text-xs text-white"
                      />
                    </td>
                    <td className="py-3 text-amber-300 font-mono font-bold">{money(row.platformFeeAmount)}</td>
                    <td className="py-3 text-blue-300 font-mono font-bold">{money(row.ownerPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vehicles ──────────────────────────────────────────────────────────────────
function VehiclesTab() {
  const { state, dispatch } = useApp();
  const { vehicles, theme, currentUser } = state;
  const { t } = useI18n();
  const [editing, setEditing] = useState(null);
  const [owners,  setOwners]  = useState([]);
  const [adminVehicles, setAdminVehicles] = useState([]);

  useEffect(() => {
    fetchOwnersList().then(d => setOwners(d)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.isMaster) {
      setAdminVehicles([]);
      return () => { cancelled = true; };
    }
    fetchAdminVehicleList()
      .then(data => { if (!cancelled) setAdminVehicles(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setAdminVehicles([]); });
    return () => { cancelled = true; };
  }, [currentUser?.isMaster]);

  const { byId: ownerMap } = ownerLookupMaps(owners);
  const getOwner = (v) => {
    const ownerId = vehicleOwnerId(v);
    return ownerId ? ownerMap[String(ownerId)] : null;
  };
  const displayVehicles = currentUser?.isMaster && adminVehicles.length > 0 ? adminVehicles : vehicles;
  const visibleVehicles = currentUser?.isMaster ? displayVehicles : displayVehicles.filter(v => String(v.status ?? '').toLowerCase() !== 'deleted');

  const blank = {
    id: Date.now(), cls: 'standard', type: 'corporate',
    maker: '', model: '', year: new Date().getFullYear(), grade: '',
    pax: 5, fuel: 'Gasoline', trans: 'AT',
    priceDay: 0, priceHour: 0, deposit: 0, insurance: 0,
    rating: 5.0, reviews: 0, loc: '', lat: null, lng: null,
    img: '', badge: null, tags: [], status: 'active',
    oneWayEnabled: false,
    inspectionExpiry: '', licensePlate: '', inspectionCertUrl: '', insuranceCertUrl: '',
  };

  const save = async (v) => {
    try {
      // Supabase に保存（multipart/form-data）
      const fd = new FormData();
      fd.append('vehicle', JSON.stringify(v));

      const res = await fetch('/api/vehicles', { method: 'POST', body: fd });
      const saved = await res.json();

      if (!res.ok) throw new Error(saved.error || 'Save failed');

      // stateも更新
      dispatch({ type: 'UPSERT_VEHICLE', v: { ...v, ...saved } });
      dispatch({ type: 'TOAST', msg: t('saveVehicle') + ' ✓' });
      setEditing(null);
    } catch (e) {
      dispatch({ type: 'TOAST', msg: t('ad_saveError') + e.message });
    }
  };

  const del = async (id) => {
    if (!confirm(t('deleteVehicle') + '?')) return;
    try {
      const url = currentUser?.isMaster ? `/api/admin/vehicles/${id}/force-delete` : `/api/vehicles/${id}`;
      const requestOptions = { method: currentUser?.isMaster ? 'POST' : 'DELETE' };
      if (currentUser?.isMaster) {
        const accessToken = await masterAccessToken();
        Object.assign(requestOptions, {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: currentUser.id, requesterEmail: currentUser.email, accessToken }),
        });
      }
      const res = await fetch(url, requestOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(vehicleDeleteErrorText(data, res, t));
      setAdminVehicles(prev => prev.filter(v => String(vehicleIdOf(v)) !== String(id)));
      dispatch({ type: 'DELETE_VEHICLE', id, persist: false });
      dispatch({ type: 'TOAST', msg: t('od_deleteSuccess') });
    } catch (e) {
      dispatch({ type: 'TOAST', msg: t('od_deleteFailed') + ': ' + (e.message ?? '') });
    }
  };

  if (editing) return <VehicleForm vehicle={editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{t('vehicles')}</h1>
        <GradBtn theme={theme} className="px-4 py-2 text-sm" onClick={() => setEditing({ ...blank, id: Date.now() })}>
          + {t('addVehicle')}
        </GradBtn>
      </div>
      <div className="space-y-3">
        {visibleVehicles.map(v => (
          <div key={v.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
            <img src={v.img || 'https://via.placeholder.com/80x60?text=Car'} alt={v.model} className="w-20 h-14 object-cover rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-semibold">{v.maker} {v.model} {v.year}</p>
                <StatusBadge status={v.status} />
                <Tag>{v.cls}</Tag>
                {v.lat && v.lng && (
                  <span className="text-xs bg-green-900/30 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">📍 Located</span>
                )}
                {v.inspectionExpiry && (() => {
                  const days = Math.ceil((new Date(v.inspectionExpiry) - new Date()) / 86400000);
                  if (days <= 30) return <span className={`text-xs px-2 py-0.5 rounded-full border ${days <= 7 ? 'text-red-400 border-red-800 bg-red-900/20' : 'text-yellow-400 border-yellow-800 bg-yellow-900/20'}`}>🔍 {days}d</span>;
                  return null;
                })()}
              </div>
              <p className="text-gray-400 text-sm">{v.loc} · ¥{v.priceDay.toLocaleString()}/day</p>
              {(() => { const o = getOwner(v); return o ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800 px-2 py-0.5 rounded-full mt-0.5">
                  🏪 {o.store_name}
                </span>
              ) : vehicleOwnerId(v) ? (
                <span className="text-xs text-gray-600">owner: {compactId(vehicleOwnerId(v))}</span>
              ) : null; })()}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditing(v)} className="text-xs border border-gray-700 text-gray-300 hover:text-white rounded-lg px-3 py-1.5 transition-colors">{t('editVehicle').split(' ')[0]}</button>
              <button onClick={() => del(v.id)} className="text-xs border border-red-800 text-red-400 hover:text-red-300 rounded-lg px-3 py-1.5 transition-colors">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── VehicleForm (with Geocoding + i18n) ──────────────────────────────────────
function VehicleForm({ vehicle, onSave, onCancel }) {
  const { state } = useApp();
  const { theme } = state;
  const { t } = useI18n();
  const [v, setV] = useState({ ...vehicle, tags: vehicle.tags?.join(', ') ?? '' });
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [mapPreview, setMapPreview] = useState(!!(vehicle.lat && vehicle.lng));

  const upd = (k, val) => setV(p => ({ ...p, [k]: val }));

  const [saveError, setSaveError] = useState('');

  const handleSave = () => {
    // 自動車保険付保証明書は必須
    if (!v.insuranceCertUrl) {
      setSaveError(t('ad_insCertNeeded'));
      return;
    }
    setSaveError('');
    onSave({
      ...v,
      tags: v.tags.split(',').map(t => t.trim()).filter(Boolean),
      priceDay:  +v.priceDay,
      priceHour: +v.priceHour,
      deposit:   +v.deposit,
      insurance: +v.insurance,
      pax:       +v.pax,
      year:      +v.year,
      lat: v.lat ? +v.lat : null,
      lng: v.lng ? +v.lng : null,
      // 跨区域送车（异地调车）設定
      deliveryAvailable: !!v.deliveryAvailable,
      deliveryFee:       v.deliveryFee ? +v.deliveryFee : 0,
      deliveryEtaHours:  v.deliveryEtaHours ? +v.deliveryEtaHours : 0,
      oneWayReturn:      !!v.oneWayEnabled,
    });
  };

  // ── Geocode address → lat/lng via Google Geocoding API ──────────────────────
  const geocodeAddress = async () => {
    if (!v.loc) return;
    setGeocoding(true);
    setGeoError('');
    try {
      const hit = await gmapsGeocode(v.loc);
      if (hit) {
        upd('lat', hit.lat);
        upd('lng', hit.lng);
        setMapPreview(true);
      } else {
        setGeoError('Location not found. Try a more specific address.');
      }
    } catch {
      setGeoError('Geocoding failed. Check your API key / billing / connection.');
    } finally {
      setGeocoding(false);
    }
  };

  const clearCoords = () => { upd('lat', null); upd('lng', null); setMapPreview(false); };

  // ── Helper renders ───────────────────────────────────────────────────────────
  const field = (label, key, type = 'text', extra = {}) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={v[key] ?? ''}
        onChange={e => upd(key, e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
        {...extra}
      />
    </div>
  );

  const sel = (label, key, options) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select
        value={v[key]}
        onChange={e => upd(key, e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
      >
        {options.map(o => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}
      </select>
    </div>
  );

  const sectionHead = (emoji, label) => (
    <div className="col-span-2 border-t border-gray-800 pt-4 mt-1">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{emoji} {label}</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm transition-colors">← {t('backToSite').replace('← ', '')}</button>
        <h1 className="text-2xl font-bold text-white">{vehicle.maker ? t('editVehicle') : t('addVehicle')}</h1>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 grid grid-cols-2 gap-4">

        {/* ── Basic Info ── */}
        {field(t('o_maker'), 'maker')}
        {field('Model', 'model')}
        {field('Grade', 'grade')}
        {field('Year',  'year', 'number')}
        {sel(t('allClasses').replace('All ', ''), 'cls',
          VEHICLE_CLASSES.filter(c => c.id !== 'all').map(c => ({ v: c.id, l: c.label })))}
        {sel('Type', 'type', [
          { v: 'corporate', l: `🚗 ${t('regularRental')}` },
        ])}
        {sel(t('fuel'), 'fuel', ['Gasoline','Hybrid','Electric','Diesel'])}
        {sel(t('transmission'), 'trans', ['AT','MT','CVT'])}
        {field(t('pax'), 'pax', 'number')}
        {field(`Price${t('perDay')}`, 'priceDay',  'number')}
        {field(`Price${t('perHour')}`, 'priceHour', 'number')}
        {field('Insurance (¥)', 'insurance', 'number')}
        {field('Deposit (¥)',   'deposit',   'number')}
        {sel('Status', 'status', [
          { v: 'active',      l: `✅ ${t('active')}` },
          { v: 'maintenance', l: `🔧 ${t('maintenance')}` },
          { v: 'inactive',    l: `❌ ${t('inactive')}` },
        ])}
        {field('Badge Text', 'badge')}
        <div className="col-span-2">{field('Tags (comma-separated)', 'tags')}</div>

        {/* ── One-way rental toggle ── */}
        <div className="col-span-2">
          <div
            onClick={() => upd('oneWayEnabled', !v.oneWayEnabled)}
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
              v.oneWayEnabled
                ? 'border-purple-500 bg-purple-900/20'
                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">↗️</span>
              <div>
                <p className="text-white text-sm font-semibold">{t('o_oneWayTitle')}</p>
                <p className="text-gray-400 text-xs">Allow customers to return this vehicle at a different location (+¥3,300)</p>
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-all relative ${v.oneWayEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${v.oneWayEnabled ? 'left-7' : 'left-1'}`} />
            </div>
          </div>
        </div>

        {/* ── 跨区域送车（异地调车）— 加盟店送車設定 ── */}
        <div className="col-span-2">
          <div
            onClick={() => upd('deliveryAvailable', !v.deliveryAvailable)}
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
              v.deliveryAvailable ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🚚</span>
              <div>
                <p className="text-white text-sm font-semibold">{t('adx_crossRegionTitle')}</p>
                <p className="text-gray-400 text-xs">{t('adx_crossRegionDesc')}</p>
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-all relative ${v.deliveryAvailable ? 'bg-amber-500' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${v.deliveryAvailable ? 'left-7' : 'left-1'}`} />
            </div>
          </div>
        </div>
        {v.deliveryAvailable && (
          <>
            {field(t('adx_deliveryFee'), 'deliveryFee', 'number')}
            {field(t('adx_deliveryEta'), 'deliveryEtaHours', 'number')}
          </>
        )}

        {/* ── Airport Availability + One-Way Fees ── */}
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-2">{t('adx_airportsLabelEn')}</label>
          <p className="text-gray-600 text-xs mb-3">
            {t('ad_airportHint')}
          </p>
          <div className="space-y-2">
            {(JAPAN_AIRPORTS || []).map(ap => {
              const selected  = Array.isArray(v.airports) && v.airports.includes(ap.code);
              const feeKey    = `airportFee_${ap.code}`;
              const feeVal    = v[feeKey] ?? '';

              const toggleAirport = () => {
                const current = Array.isArray(v.airports) ? v.airports : [];
                upd('airports', selected
                  ? current.filter(c => c !== ap.code)
                  : [...current, ap.code]
                );
              };

              return (
                <div
                  key={ap.code}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selected
                      ? 'border-purple-500 bg-purple-900/20'
                      : 'border-gray-700 bg-gray-800/30'
                  }`}
                >
                  {/* Checkbox toggle */}
                  <div
                    onClick={toggleAirport}
                    className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected ? 'border-purple-500 bg-purple-600' : 'border-gray-600'
                    }`}>
                      {selected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <span className="text-xl">{ap.emoji}</span>
                    <div className="min-w-0">
                      <span className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-400'}`}>{ap.code}</span>
                      <span className="text-gray-500 text-xs ml-1.5">{ap.city}</span>
                    </div>
                  </div>

                  {/* One-way fee input — only shown when oneWayEnabled AND airport selected */}
                  {v.oneWayEnabled && selected && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 text-xs">{t('ad_returnFee')}</span>
                      <span className="text-gray-400 text-xs">¥</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={feeVal}
                        onChange={e => upd(feeKey, e.target.value ? Number(e.target.value) : '')}
                        placeholder="3300"
                        className="w-24 bg-gray-900 border border-gray-600 text-white rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-purple-500"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {v.oneWayEnabled && !selected && (
                    <span className="text-gray-700 text-xs flex-shrink-0">{t('ad_selectAirportFee')}</span>
                  )}
                </div>
              );
            })}
          </div>
          {v.oneWayEnabled && (
            <p className="text-gray-600 text-xs mt-2">
              {t('ad_feeDefaultNote')}
            </p>
          )}
        </div>

        {/* ── Vehicle Photo ── */}
        <div className="col-span-2">
          <VehicleImageUploader
            value={v.img}
            onChange={({ url }) => upd('img', url)}
          />
          {/* Also allow manual URL entry as fallback */}
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">Or paste image URL directly</label>
            <input
              type="text"
              value={v.img?.startsWith('data:') ? '' : (v.img ?? '')}
              onChange={e => upd('img', e.target.value)}
              placeholder="https://example.com/car.jpg"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* ── Location + Interactive Map Picker ── */}
        {sectionHead('📍', 'Location & Map')}
        <div className="col-span-2 space-y-3">
          {/* Display name (shown on vehicle cards) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Display Name (shown on vehicle card)</label>
            <input
              value={v.loc ?? ''}
              onChange={e => upd('loc', e.target.value)}
              placeholder={t('od_phDisplayName')}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Interactive Leaflet map — click or search to drop pin */}
          <AdminMapPicker
            lat={v.lat}
            lng={v.lng}
            onChange={({ lat, lng, address }) => {
              if (lat !== undefined) upd('lat', lat);
              if (lng !== undefined) upd('lng', lng);
              if (address && !v.loc) upd('loc', address); // auto-fill display name if empty
            }}
          />

          {!v.lat && !v.lng && (
            <div className="flex items-center gap-2 text-gray-600 text-xs bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-800">
              <span>⚠️</span> No location set — vehicle won't appear on map
            </div>
          )}
        </div>

        {/* ── Vehicle Inspection ── */}
        {sectionHead('🔍', t('inspectionExpiry').replace(' Date', ''))}
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('inspectionExpiry')}</label>
          <input
            type="date"
            value={v.inspectionExpiry ?? ''}
            onChange={e => upd('inspectionExpiry', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          {v.inspectionExpiry && (() => {
            const days = Math.ceil((new Date(v.inspectionExpiry) - new Date()) / 86400000);
            const [color, label] = days <= 0
              ? ['text-red-400', '❌ EXPIRED']
              : days <= 7
              ? ['text-red-400', `⚠️ ${days} days`]
              : days <= 30
              ? ['text-yellow-400', `⏳ ${days} days`]
              : ['text-green-400', `✅ ${days} days`];
            return <p className={`text-xs mt-1 font-semibold ${color}`}>{label}</p>;
          })()}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">License Plate</label>
          <input
            type="text"
            value={v.licensePlate ?? ''}
            onChange={e => upd('licensePlate', e.target.value)}
            placeholder="品川 300 あ 1234"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="col-span-2">
          <InspectionUploader
            value={v.inspectionCertUrl ?? ''}
            onChange={({ url }) => upd('inspectionCertUrl', url)}
          />
        </div>
      </div>

      {/* ── 自動車保険付保内証明書（必須） ── */}
      <div className="mt-6 p-4 rounded-2xl border-2 border-dashed border-purple-500/40 bg-purple-500/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-purple-400 text-lg">🛡️</span>
          <span className="text-sm font-bold text-white">{t('o_insuranceCertTitle')}</span>
          <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-lg">{t('o_required')}</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {t('ad_insCertDesc')}
        </p>
        <InspectionUploader
          label={t('o_insuranceCertUpload')}
          value={v.insuranceCertUrl ?? ''}
          onChange={({ url }) => { upd('insuranceCertUrl', url); setSaveError(''); }}
        />
        {!v.insuranceCertUrl && (
          <p className="text-xs text-orange-400 mt-2">{t('o_uploadNeeded')}</p>
        )}
        {v.insuranceCertUrl && (
          <p className="text-xs text-green-400 mt-2">{t('o_uploaded')}</p>
        )}
      </div>

      {saveError && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {saveError}
        </div>
      )}

      {/* Image preview */}
      {v.img && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2">Image Preview:</p>
          <img src={v.img} alt="preview" className="w-48 h-32 object-cover rounded-xl border border-gray-700" />
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <GradBtn theme={theme} className="px-6 py-2.5 text-sm" onClick={handleSave}>{t('saveVehicle')}</GradBtn>
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm border border-gray-700 rounded-xl px-6 py-2.5 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── Parking ───────────────────────────────────────────────────────────────────
function ParkingTab() {
  const { state } = useApp();
  const { parking } = state;
  const { t } = useI18n();
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">{t('parking')}</h1>
      <div className="space-y-3">
        {parking.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
            <img src={p.img} alt={p.name} className="w-20 h-14 object-cover rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <p className="text-white font-semibold">{p.name}</p>
              <p className="text-gray-400 text-sm">{p.addr}</p>
              <p className="text-gray-400 text-sm">¥{p.priceHour}/hr · {p.available}/{p.total} available</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.available > 0 ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
              {p.available > 0 ? t('active') : 'Full'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reservations ──────────────────────────────────────────────────────────────
function ReservationsTab() {
  const { state } = useApp();
  const { reservations } = state;
  const { t } = useI18n();
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">{t('reservations')}</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <ReservationTable reservations={reservations} />
      </div>
    </div>
  );
}

function ReservationTable({ reservations }) {
  const { state, dispatch } = useApp();
  const { vehicles, users } = state;
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-left border-b border-gray-800">
            <th className="pb-3 font-medium">ID</th>
            <th className="pb-3 font-medium">{t('vehicles')}</th>
            <th className="pb-3 font-medium">{t('users')}</th>
            <th className="pb-3 font-medium">{t('pickupDate')}</th>
            <th className="pb-3 font-medium">Total</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {reservations.map(r => {
            const currentVehicleId = reservationVehicleId(r);
            const v = vehicles.find(vehicle => String(vehicleIdOf(vehicle)) === String(reservationVehicleId(r)));
            const u = users.find(user => String(user.id) === String(reservationUserId(r)));
            const vehicleText = v
              ? vehicleLabel(v)
              : currentVehicleId
              ? `${t('adx_unloadedVehicle')}${compactId(currentVehicleId)}`
              : t('adx_unassigned');
            return (
              <tr key={r.id} className="text-gray-300">
                <td className="py-3 font-mono text-xs text-gray-500">{r.id}</td>
                <td className="py-3">{vehicleText}</td>
                <td className="py-3">{u?.name ?? '—'}</td>
                <td className="py-3 text-xs">{reservationPickupAt(r)?.slice(0, 10)}</td>
                <td className="py-3 text-white font-medium">¥{Number(r.total ?? 0).toLocaleString()}</td>
                <td className="py-3"><StatusBadge status={r.status} /></td>
                <td className="py-3">
                  {r.status === 'pending' && (
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_RES', r: { ...r, status: 'confirmed' } })}
                      className="text-xs text-green-400 hover:text-green-300 border border-green-800 rounded-lg px-2 py-0.5 transition-colors"
                    >
                      {t('confirmed')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
function UsersTab() {
  const { state } = useApp();
  const { theme, currentUser } = state;
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(null); // email being reset
  const [roleEdit, setRoleEdit] = useState(null); // { id, role }
  const [detail, setDetail] = useState(null); // 詳細表示するユーザー
  const [deleting, setDeleting] = useState(null); // userId being deleted
  const [confirmDel, setConfirmDel] = useState(null); // user pending delete confirmation
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', phone: '', role: 'user', password: '' });
  const [passwordEdit, setPasswordEdit] = useState(null); // { id, password }
  const [userLoadError, setUserLoadError] = useState('');
  const [usersLoadedAt, setUsersLoadedAt] = useState(null);

  const load = async () => {
    if (!currentUser?.id) {
      setLoading(false);
      setUserLoadError(t('adx_masterSessionLoading'));
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users?requesterId=${encodeURIComponent(currentUser?.id ?? '')}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUserLoadError(adminUsersErrorText(data, res));
        setUsers([]);
        return;
      }
      setUsers(adminUsersFromPayload(data));
      setUsersLoadedAt(new Date());
      setUserLoadError('');
    } catch (e) {
      setUserLoadError(e.message || t('adx_userLoadFailed'));
      setUsers([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [currentUser?.id]);

  const sendReset = async (email) => {
    if (!confirm(t('adx_confirmPwReset').replace('{email}', email))) return;
    setSending(email);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, email, action: 'reset_password' }),
      });
      if (!res.ok) throw new Error('failed');
      alert(t('adx_sent'));
    } catch { alert(t('adx_sendFailed')); }
    finally { setSending(null); }
  };

  const createUser = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, action: 'create_user', ...newUser }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('adx_createFailed')); return; }
      setNewUser({ name: '', email: '', phone: '', role: 'user', password: '' });
      await load();
      alert(t('adx_created'));
    } catch { alert(t('adx_createFailed')); }
    finally { setCreating(false); }
  };

  const setPasswordForUser = async (u) => {
    const password = passwordEdit?.password ?? '';
    if (password.length < 6) { alert(t('adx_passwordTooShort')); return; }
    setSending(u.email);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, action: 'set_password', userId: u.id, password }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('adx_passwordChangeFailed')); return; }
      setPasswordEdit(null);
      alert(t('adx_passwordChanged'));
    } catch { alert(t('adx_passwordChangeFailed')); }
    finally { setSending(null); }
  };

  const changeRole = async (userId, role) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: currentUser?.id, userId, role }),
    });
    setRoleEdit(null);
    load();
  };

  const deleteUser = async (u) => {
    setDeleting(u.id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, userId: u.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '削除に失敗しました。'); return; }
      setConfirmDel(null);
      setDetail(null);
      setUsers(list => list.filter(x => x.id !== u.id));
    } catch { alert('通信に失敗しました。'); }
    finally { setDeleting(null); }
  };

  const ROLE_STYLE = {
    admin: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
    user:  'bg-gray-800 text-gray-400 border-gray-700',
    owner: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  };

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.name?.toLowerCase().includes(search.toLowerCase())
  );

  const userCounts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    owner: users.filter(u => u.role === 'owner').length,
    user: users.filter(u => (u.role ?? 'user') === 'user').length,
  };

  return (
    <div>
      {currentUser?.isMaster ? (
        <section className="mb-5 overflow-hidden rounded-2xl border border-purple-500/30 bg-gray-950 text-white shadow-xl">
          <div className="border-b border-gray-800 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-300">{t('adx_masterBadge')}</div>
                <h1 className="mt-1 text-2xl font-black">{t('adx_masterUsersTitle')}</h1>
                <p className="mt-1 max-w-2xl text-sm text-gray-400">{t('adx_masterUsersSub')}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-purple-100">{currentUser.email}</span>
                <span className={`rounded-lg border px-3 py-2 ${userLoadError ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
                  {userLoadError ? t('adx_apiError') : t('adx_apiOk')}
                </span>
                <button onClick={load} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 transition-colors hover:border-purple-500 hover:text-white">{t('ad_refreshBtn')}</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-gray-800 md:grid-cols-4">
            {[
              [t('adx_totalAccounts'), userCounts.all],
              ['admin', userCounts.admin],
              ['owner', userCounts.owner],
              ['user', userCounts.user],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-950 px-5 py-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 text-xs text-gray-500">
            {t('adx_loadedAt')}: {formatLoadedAt(usersLoadedAt)}
          </div>
        </section>
      ) : (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{t('users')} <span className="text-gray-500 text-lg font-normal">({users.length})</span></h1>
          <button onClick={load} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors">{t('ad_refreshBtn')}</button>
        </div>
      )}

      {currentUser?.isMaster && (
        <div className="mb-4 rounded-2xl border border-purple-800/40 bg-purple-950/20 p-4">
          <h2 className="mb-3 text-sm font-bold text-white">{t('adx_addUser')}</h2>
          <div className="grid gap-2 md:grid-cols-5">
            <input
              value={newUser.name}
              onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
              placeholder={t('adx_newUserName')}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
            <input
              value={newUser.email}
              onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
              placeholder={t('am_email')}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
            <input
              value={newUser.phone}
              onChange={e => setNewUser(u => ({ ...u, phone: e.target.value }))}
              placeholder={t('oo_phone')}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
            <input
              type="text"
              autoComplete="off"
              value={newUser.password}
              onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
              placeholder={t('adx_tempPassword')}
              className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
            <div className="flex gap-2">
              <select
                value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                className="min-w-24 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              >
                {['user', 'owner', 'admin'].map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <button
                onClick={createUser}
                disabled={creating || !newUser.email || !newUser.password}
                className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {creating ? t('adx_creating') : t('adx_addUser')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 検索 */}
      <div className="mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('adx_phUserSearch')}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* 注意書き */}
      <div className="mb-4 px-4 py-3 bg-yellow-900/20 border border-yellow-700/40 rounded-xl flex items-start gap-2">
        <span className="text-yellow-400">⚠️</span>
        <p className="text-yellow-200/80 text-xs">{t('adx_pwNote')}</p>
      </div>

      {userLoadError && (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-100">
          <div className="font-bold">{t('adx_userLoadFailed')}</div>
          <div className="mt-1 break-all text-xs text-red-200/80">{userLoadError}</div>
          <button onClick={load} className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-bold text-red-100 hover:bg-red-500/10">{t('ad_refreshBtn')}</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-12">{t('o_loading')}</p>
      ) : userLoadError ? null : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-12">{search ? t('adx_noMatchingUsers') : t('adx_noUsers')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {/* メイン行 */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-purple-900/40 text-purple-300 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(u.name ?? u.email ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{u.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${ROLE_STYLE[u.role] ?? ROLE_STYLE.user}`}>
                      {u.role}
                    </span>
                    {!u.emailConfirmed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-400 border border-orange-700/40">{t('adx_unverified')}</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setDetail(detail?.id === u.id ? null : u)}
                    className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    {detail?.id === u.id ? t('adx_collapse') : t('adx_detail')}
                  </button>
                </div>
              </div>

              {/* 詳細パネル */}
              {detail?.id === u.id && (
                <div className="border-t border-gray-800 px-5 py-4 bg-gray-800/30">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-4">
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_userId')}</p>
                      <p className="text-gray-300 font-mono text-xs break-all">{u.id}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('oo_email')}</p>
                      <p className="text-white">{u.email}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_registeredAt')}</p>
                      <p className="text-white">{fmt(u.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_lastLogin')}</p>
                      <p className="text-white">{fmt(u.lastSignIn)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_emailVerification')}</p>
                      <p className={u.emailConfirmed ? 'text-green-400' : 'text-orange-400'}>
                        {u.emailConfirmed ? t('adx_verified') : t('adx_unverifiedIcon')}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_password')}</p>
                      <p className="text-gray-600 text-xs">{t('adx_hiddenForSecurity')}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs mb-0.5">{t('adx_accountInfo')}</p>
                      <pre className="max-h-40 overflow-auto rounded-xl border border-gray-700 bg-gray-950 p-3 text-[11px] text-gray-300">
{JSON.stringify({
  phone: u.phone,
  providers: u.providers,
  userMetadata: u.userMetadata,
  appMetadata: u.appMetadata,
}, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-gray-700">
                    {/* 役割変更（マスター専用） */}
                    {currentUser?.isMaster && (
                      roleEdit?.id === u.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{t('adx_role')}</span>
                          {['user', 'owner', 'admin'].map(r => (
                            <button key={r} onClick={() => changeRole(u.id, r)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${u.role === r ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                              {r}
                            </button>
                          ))}
                          <button onClick={() => setRoleEdit(null)} className="text-xs text-gray-500 hover:text-white">{t('ar_cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={() => setRoleEdit(u)}
                          className="text-xs text-gray-300 border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors">
                          {t('adx_changeRole')}
                        </button>
                      )
                    )}

                    {/* パスワード操作（マスター専用） */}
                    {currentUser?.isMaster && (
                      <>
                        <button
                          onClick={() => sendReset(u.email)}
                          disabled={sending === u.email}
                          className="text-xs text-orange-300 border border-orange-700/50 hover:bg-orange-900/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {sending === u.email ? t('adx_sending2') : t('adx_sendPwReset')}
                        </button>
                        {passwordEdit?.id === u.id ? (
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="text"
                              autoComplete="off"
                              value={passwordEdit.password}
                              onChange={e => setPasswordEdit({ id: u.id, password: e.target.value })}
                              placeholder={t('adx_tempPassword')}
                              className="w-44 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-white outline-none focus:border-orange-500"
                            />
                            <button
                              onClick={() => setPasswordForUser(u)}
                              disabled={sending === u.email}
                              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50"
                            >
                              {t('adx_savePassword')}
                            </button>
                            <button onClick={() => setPasswordEdit(null)} className="text-xs text-gray-400 hover:text-white">{t('ar_cancel')}</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setPasswordEdit({ id: u.id, password: '' })}
                            className="text-xs text-orange-300 border border-orange-700/50 hover:bg-orange-900/20 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            {t('adx_setPassword')}
                          </button>
                        )}
                      </>
                    )}

                    {/* アカウント削除（最高権限管理者のみ） */}
                    {currentUser?.isMaster && String(u.id) !== String(currentUser?.id) && (
                      confirmDel?.id === u.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-red-300">{t('adx_delConfirm')}</span>
                          <button
                            onClick={() => deleteUser(u)}
                            disabled={deleting === u.id}
                            className="text-xs text-white bg-red-600 hover:bg-red-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                          >
                            {deleting === u.id ? t('adx_deleting') : t('adx_delYes')}
                          </button>
                          <button onClick={() => setConfirmDel(null)} className="text-xs text-gray-400 hover:text-white">{t('ar_cancel')}</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(u)}
                          className="text-xs text-red-400 border border-red-800/60 hover:bg-red-900/20 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          {t('adx_deleteAccount')}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_BANNER_BYTES = 1024 * 1024;
const BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function BannerManager() {
  const { t } = useI18n();
  const { state, dispatch } = useApp();
  const { heroBanners, theme } = state;
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(heroBanners ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(heroBanners ?? []);
  }, [heroBanners]);

  const updateAlt = (id, alt) => {
    setDraft(current => current.map(b => b.id === id ? { ...b, alt } : b));
  };

  const addBanner = async (file) => {
    if (!file) return;
    if (!BANNER_TYPES.includes(file.type)) {
      setError(t('adx_imgTypeErr'));
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setError(t('adx_imgSizeErr'));
      return;
    }
    if (draft.length >= 8) {
      setError(t('adx_bannerMax'));
      return;
    }

    const src = await readBannerFile(file);
    setDraft(current => [
      ...current,
      {
        id: `hero-banner-${Date.now()}`,
        src,
        alt: file.name.replace(/\.[^.]+$/, '') || `BEST Car Rental banner ${current.length + 1}`,
      },
    ]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const moveBanner = (index, dir) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= draft.length) return;
    setDraft(current => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeBanner = (id) => {
    if (draft.length <= 1) {
      setError(t('adx_bannerMin'));
      return;
    }
    setDraft(current => current.filter(b => b.id !== id));
    setError('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await dispatch({ type: 'UPDATE_HERO_BANNERS', banners: draft });
      dispatch({ type: 'TOAST', msg: t('adx_bannerSaved') });
    } catch (e) {
      setError(e.message || t('adx_saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('adx_bannerMgmt')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('adx_bannerDesc')}</p>
        </div>
        <GradBtn theme={theme} className="px-5 py-2 text-sm" onClick={save} disabled={saving}>
          {saving ? t('o_saving') : t('adx_saveOrder')}
        </GradBtn>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-semibold">{t('adx_addBanner')}</p>
            <p className="text-gray-500 text-xs mt-1">{t('adx_bannerHint')}</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-xl border border-purple-500 text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 text-sm font-semibold transition-colors"
          >
            {t('adx_upload')}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={e => addBanner(e.target.files?.[0])}
          className="hidden"
        />
        {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
      </div>

      <div className="space-y-3">
        {draft.map((banner, index) => (
          <div key={banner.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex gap-4">
            <img src={banner.src} alt={banner.alt} className="w-44 h-24 rounded-xl object-cover bg-gray-800 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-purple-200 bg-purple-500/20 border border-purple-500/30 rounded-full px-2 py-0.5">
                  {index + 1}{t('adx_ordinalSuffix')}
                </span>
                <span className="text-gray-500 text-xs truncate">{banner.src.startsWith('data:') ? t('adx_uploadedImage') : banner.src}</span>
              </div>
              <label className="block text-xs text-gray-500 mb-1">{t('adx_altText')}</label>
              <input
                value={banner.alt ?? ''}
                onChange={e => updateAlt(banner.id, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={() => moveBanner(index, -1)}
                disabled={index === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 text-xs disabled:opacity-30 hover:text-white"
              >
                {t('adx_moveUp')}
              </button>
              <button
                onClick={() => moveBanner(index, 1)}
                disabled={index === draft.length - 1}
                className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 text-xs disabled:opacity-30 hover:text-white"
              >
                {t('adx_moveDown')}
              </button>
              <button
                onClick={() => removeBanner(banner.id)}
                className="px-3 py-1.5 rounded-lg border border-red-800 text-red-300 text-xs hover:bg-red-900/30"
              >
                {t('ar_delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function readBannerFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error(t('adx_imgReadErr')));
    reader.readAsDataURL(file);
  });
}

// ── Theme Editor ──────────────────────────────────────────────────────────────
function ThemeEditor() {
  const { state, dispatch } = useApp();
  const { theme } = state;
  const { t } = useI18n();
  const upd = (k, v) => dispatch({ type: 'UPDATE_THEME', patch: { [k]: v } });

  const colorField = (label, key) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-800">
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-gray-500 text-xs font-mono">{theme[key]}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg border border-gray-700" style={{ background: theme[key] }} />
        <input
          type="color"
          value={theme[key]}
          onChange={e => upd(key, e.target.value)}
          className="w-10 h-8 cursor-pointer rounded-lg border-0 bg-transparent"
        />
      </div>
    </div>
  );

  const textField = (label, key, placeholder) => (
    <div className="py-3 border-b border-gray-800">
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <input
        type="text"
        value={theme[key]}
        onChange={e => upd(key, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
      />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{t('themeEditor')}</h1>
        <p className="text-green-400 text-sm">Changes apply live ↗</p>
      </div>
      <div
        className="rounded-2xl p-6 mb-6 text-white"
        style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
      >
        <div className="text-sm font-bold opacity-70">Live Preview</div>
        <div className="text-2xl font-black mt-1">{theme.heroTitle}</div>
        <div className="text-2xl font-black">{theme.heroAccent}</div>
        <div className="text-sm opacity-70 mt-2">{theme.heroSub}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-2">Colors</h2>
          {colorField('Primary',    'primary')}
          {colorField('Accent',     'accent')}
          {colorField('Header BG',  'headerBg')}
          {colorField('Page BG',    'pageBg')}
          {colorField('Card BG',    'cardBg')}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-2">Text & Copy</h2>
          {textField('Logo Text',     'logoText',  'Best Car Rental')}
          {textField('Hero Title',    'heroTitle', 'Your Journey,')}
          {textField('Hero Accent',   'heroAccent','Your Rules.')}
          {textField('Hero Subtitle', 'heroSub',   'Subtitle...')}
          {textField('Badge Text',    'badge',     'Global Mobility Platform')}
          {textField('Search Button', 'searchBtn', 'Search')}
          {textField('Footer Text',   'footerText','© 2025 Best Car Rental')}
        </div>
      </div>
    </div>
  );
}

// ── OwnersTab — 加盟店申請管理 ───────────────────────────────
function OwnersTab() {
  const { t } = useI18n();
  const { state } = useApp();
  const { theme, currentUser } = state;
  const g = `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`;

  const [owners,   setOwners]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null); // 詳細表示中の申請
  const [filter,   setFilter]   = useState('all'); // all | pending | approved | rejected
  const [rejReason, setRejReason] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [publicStoreName, setPublicStoreName] = useState('');
  const [savingStoreName, setSavingStoreName] = useState(false);
  const [storeNameMsg, setStoreNameMsg] = useState('');
  const [deletingStoreId, setDeletingStoreId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchOwnersList();
      setOwners(Array.isArray(data) ? data.filter(owner => !isMasterDeletedOwner(owner)) : []);
    } catch { setOwners([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    setPublicStoreName(selected?.store_name ?? '');
    setStoreNameMsg('');
  }, [selected?.id, selected?.store_name]);

  const updateStatus = async (id, status) => {
    if (status === 'rejected' && !rejReason.trim()) {
      alert(t('ad_enterRejectReason')); return;
    }
    if (status === 'approved' && !publicStoreName.trim()) {
      alert(t('ad_publicStoreNameRequired')); return;
    }
    setSaving(true);
    try {
      const statusPayload = { id, status, rejectionReason: rejReason };
      if (publicStoreName.trim()) statusPayload.storeName = publicStoreName;
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusPayload),
      });
      if (!res.ok) throw new Error(t('ad_updateFailed'));
      setSelected(null);
      setRejReason('');
      await load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const savePublicStoreName = async () => {
    if (!selected?.id) return;
    if (!publicStoreName.trim()) {
      setStoreNameMsg(t('ad_publicStoreNameRequired')); return;
    }
    setSavingStoreName(true);
    setStoreNameMsg('');
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, storeName: publicStoreName }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? t('ad_updateFailed'));
      setSelected(json);
      setOwners(prev => prev.map(owner => owner.id === json.id ? json : owner));
      setStoreNameMsg(t('ad_publicStoreNameSaved'));
    } catch (e) {
      setStoreNameMsg(e.message);
    } finally {
      setSavingStoreName(false);
    }
  };

  async function deleteAdditionalStore(owner) {
    if (!owner?.id || !currentUser?.isMaster) return;
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(`追加店舗を削除しますか？\n\n${owner.store_name ?? owner.applicant_name ?? owner.id}\n\n過去の予約・売上履歴は分析用に残し、店舗と車両はオーナー画面から外します。`);
    if (!ok) return;

    setDeletingStoreId(owner.id);
    try {
      const res = await fetch('/api/owners', {
        method: 'DELETE',
        headers: await masterSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requesterId: currentUser?.id, id: owner.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'delete failed');
      setOwners(prev => prev.filter(candidate => String(candidate?.id) !== String(owner.id)));
      setSelected(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingStoreId(null);
    }
  }

  const STATUS_COLOR = {
    pending:  'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
    approved: 'bg-green-900/40 text-green-400 border-green-700/40',
    rejected: 'bg-red-900/40 text-red-400 border-red-700/40',
  };
  const STATUS_LABEL = { pending: t('ad_reviewing'), approved: t('ad_approved'), rejected: t('ad_rejected') };
  const isStoreAddition = owner => owner?.business_type === 'additional_store';
  const applicationTypeLabel = owner => isStoreAddition(owner)
    ? t('ad_storeAdditionApplication')
    : t('ad_newOwnerApplication');
  const businessTypeLabel = owner => {
    if (isStoreAddition(owner)) return t('ad_additionalStore');
    return owner?.business_type === 'individual' ? t('ad_individual') : t('ad_corp');
  };

  const filtered = filter === 'all' ? owners : owners.filter(o => o.status === filter);

  // ── 詳細モーダル ──
  if (selected) {
    const o = selected;
    const row = (label, val) => val ? (
      <div key={label} className="flex gap-3 py-2 border-b border-gray-800 text-sm">
        <span className="text-gray-500 w-36 flex-shrink-0">{label}</span>
        <span className="text-white break-all">{val}</span>
      </div>
    ) : null;

    const docLink = (label, url) => url ? (
      <a key={label} href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl text-blue-400 text-sm hover:bg-gray-700 transition-colors">
        📄 {label}
      </a>
    ) : null;

    return (
      <div className="p-6 max-w-2xl">
        <button onClick={() => { setSelected(null); setRejReason(''); }}
          className="text-gray-400 hover:text-white text-sm mb-4 flex items-center gap-1">
          {t('ad_backToList')}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-white text-xl font-bold">{o.applicant_name ?? o.store_name}</h2>
          {isStoreAddition(o) && (
            <span className="rounded-full border border-purple-500/40 bg-purple-950/50 px-2 py-0.5 text-xs font-bold text-purple-200">
              {t('ad_storeAdditionApplication')}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[o.status]}`}>
            {STATUS_LABEL[o.status]}
          </span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
          <label className="text-xs text-gray-400 mb-2 block">{t('ad_publicStoreName')}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={publicStoreName}
              onChange={e => setPublicStoreName(e.target.value)}
              placeholder={t('ad_phPublicStoreName')}
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={savePublicStoreName}
              disabled={savingStoreName}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: g }}
            >
              {savingStoreName ? t('ad_processing') : t('od_save')}
            </button>
          </div>
          {storeNameMsg && <p className="mt-2 text-xs text-gray-400">{storeNameMsg}</p>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5 space-y-0">
          {row(t('ad_applicationType'), applicationTypeLabel(o))}
          {row(t('ad_applicantName'), o.applicant_name)}
          {row(t('ad_publicStoreName'), o.store_name)}
          {row(t('ad_location'), o.store_location)}
          {row(t('ad_phone'), o.phone)}
          {row(t('ad_email'), o.email)}
          {row(t('ad_bizType'), businessTypeLabel(o))}
          {row(t('ad_corpAddr'), o.corp_address)}
          {row(t('ad_invoice'), o.invoice_number)}
          {row(t('ad_bankName'), o.bank_name)}
          {row(t('ad_bankBranch'), o.bank_branch)}
          {row(t('ad_acctType'), o.bank_account_type)}
          {row(t('ad_acctNo'), o.bank_account_number)}
          {row(t('ad_acctHolder'), o.bank_account_holder)}
          {row(t('ad_appliedDate'), o.created_at?.slice(0, 10))}
          {o.rejection_reason && row(t('ad_rejectReason'), o.rejection_reason)}
        </div>

        {/* 書類リンク */}
        <div className="flex flex-wrap gap-2 mb-6">
          {docLink(t('ad_idDoc'), o.id_document_url)}
          {docLink(t('ad_corpRegistry'), o.corp_registry_url)}
          {docLink(t('ad_rentalPermit'), o.rental_permit_url)}
        </div>

        {currentUser?.isMaster && isStoreAddition(o) && (
          <div className="mb-6 rounded-2xl border border-red-700/40 bg-red-950/30 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-red-200">追加店舗を削除</p>
                <p className="mt-1 text-xs leading-5 text-red-200/70">
                  マスター専用です。過去の予約・売上履歴は残し、追加店舗と公開中の車両をオーナー画面から外します。
                </p>
              </div>
              <button
                onClick={() => deleteAdditionalStore(o)}
                disabled={deletingStoreId === o.id}
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deletingStoreId === o.id ? t('ad_processing') : '追加店舗を削除'}
              </button>
            </div>
          </div>
        )}

        {/* 承認 / 却下アクション */}
        {o.status === 'pending' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h4 className="text-white font-bold text-sm mb-4">{t('ad_reviewAction')}</h4>
            <div className="mb-3">
              <label className="text-xs text-gray-400 mb-1 block">{t('ad_rejectReasonReq')}</label>
              <textarea
                value={rejReason}
                onChange={e => setRejReason(e.target.value)}
                rows={2}
                placeholder={t('ad_phRejectDocs')}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => updateStatus(o.id, 'approved')}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                style={{ background: g }}
              >
                {t('ad_approveDo')}
              </button>
              <button
                onClick={() => updateStatus(o.id, 'rejected')}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50"
              >
                {t('ad_rejectDo')}
              </button>
            </div>
          </div>
        )}

        {o.status === 'approved' && (
          <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-xl text-green-400 text-sm text-center">
            {t('ad_alreadyApproved')}
          </div>
        )}
        {o.status === 'rejected' && (
          <div className="space-y-3">
            <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-red-400 text-sm text-center">
              {t('ad_alreadyRejected')}
            </div>
            <button
              onClick={() => updateStatus(o.id, 'approved')}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: g }}
            >
              {t('ad_reApprove')}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── 一覧 ──
  const counts = {
    all:      owners.length,
    pending:  owners.filter(o => o.status === 'pending').length,
    approved: owners.filter(o => o.status === 'approved').length,
    rejected: owners.filter(o => o.status === 'rejected').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-white text-lg font-bold">{t('ad_ownerAppMgmt')}</h2>
        <button onClick={load} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 rounded-lg">
          {t('ad_refreshBtn')}
        </button>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'all',      label: `${t('ad_all')} (${counts.all})` },
          { id: 'pending',  label: `${t('ad_reviewing')} (${counts.pending})` },
          { id: 'approved', label: `${t('ad_approved')} (${counts.approved})` },
          { id: 'rejected', label: `${t('ad_rejected')} (${counts.rejected})` },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filter === f.id ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
            style={filter === f.id ? { background: g } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-10">{t('o_loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-gray-400 text-sm">{t('ad_noApplications')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <div
              key={o.id}
              onClick={() => setSelected(o)}
              className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-2xl cursor-pointer hover:border-gray-600 transition-all"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: g }}>
                {o.store_name?.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white font-semibold text-sm truncate">{o.store_name}</span>
                  {isStoreAddition(o) && (
                    <span className="rounded-full border border-purple-500/40 bg-purple-950/50 px-2 py-0.5 text-[11px] font-bold text-purple-200">
                      {t('ad_additionalStore')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLOR[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                <p className="text-gray-400 text-xs truncate">{t('ad_applicantName')}: {o.applicant_name ?? '-'}</p>
                <p className="text-gray-500 text-xs truncate">{o.store_location}</p>
                <p className="text-gray-600 text-xs">{o.email} · {o.created_at?.slice(0, 10)}</p>
              </div>
              <span className="text-gray-600 text-sm flex-shrink-0">→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentPreviewModal({ document, onClose }) {
  const { t } = useI18n();
  if (!document?.url) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[86vh] bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-14 px-4 flex items-center justify-between border-b border-gray-800">
          <div>
            <p className="text-white font-bold text-sm">{document.label}</p>
            <p className="text-gray-500 text-xs truncate max-w-xl">{document.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={document.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-300 hover:text-blue-200 border border-blue-500/40 rounded-lg px-3 py-1.5"
            >
              {t('adx_openNewTab')}
            </a>
            <button
              onClick={onClose}
              className="text-xs text-gray-300 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5"
            >
              {t('adx_collapse')}
            </button>
          </div>
        </div>
        <iframe
          src={document.url}
          title={document.label}
          className="w-full h-[calc(86vh-3.5rem)] bg-white"
        />
      </div>
    </div>
  );
}

function DocumentActionLinks({ url, label, fileName, onPreview }) {
  const { t } = useI18n();
  if (!url) return null;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onPreview?.({ label, url })}
        aria-label={`${label}を表示`}
        className="text-xs text-blue-300 hover:text-blue-200 underline"
      >
        {label}{t('adx_showSuffix')}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label}${t('adx_showNewTabSuffix')}`}
        className="text-xs text-blue-200 hover:text-blue-100 border border-blue-500/30 bg-blue-500/10 rounded-lg px-2 py-1"
      >
        {t('adx_newTab')}
      </a>
      <a
        href={url}
        download={fileName}
        aria-label={`${label}をDL`}
        className="text-xs text-purple-200 hover:text-purple-100 border border-purple-500/40 bg-purple-500/10 rounded-lg px-2 py-1"
      >
        {label}{t('adx_dlSuffix')}
      </a>
    </div>
  );
}

// ── VehicleApprovalTab ────────────────────────────────────────────
function VehicleApprovalTab() {
  const { t } = useI18n();
  const { state } = useApp();
  const { theme } = state;
  const [vehicles, setVehicles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [owners,   setOwners]   = useState([]);
  const [previewDocument, setPreviewDocument] = useState(null);
  const openDocumentPreview = (document) => setPreviewDocument(document);

  useEffect(() => {
    fetchOwnersList().then(d => setOwners(d)).catch(() => {});
  }, []);

  const { byId: ownerMap } = ownerLookupMaps(owners);
  const [filter,   setFilter]   = useState('pending'); // pending | approved | rejected | all
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [processing, setProcessing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vehicles?status=${filter}`);
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : []);
    } catch { setVehicles([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const action = async (id, approvalStatus, note = '') => {
    setProcessing(id);
    try {
      await fetch('/api/admin/vehicles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approvalStatus, approvalNote: note }),
      });
      await load();
    } finally {
      setProcessing(null);
      setRejectId(null);
      setRejectNote('');
    }
  };

  const FILTER_TABS = [
    { id: 'pending',  label: t('ad_apPendingE'), color: 'text-yellow-400' },
    { id: 'approved', label: t('ad_apApprovedE'), color: 'text-green-400' },
    { id: 'rejected', label: t('ad_apRejectedE'), color: 'text-red-400' },
    { id: 'all',      label: t('ad_apAllE'), color: 'text-gray-400' },
  ];

  const APPROVAL_BADGE = {
    pending:  'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
    approved: 'bg-green-900/40 text-green-400 border-green-700/40',
    rejected: 'bg-red-900/40 text-red-400 border-red-700/40',
  };
  const APPROVAL_LABEL = { pending: t('o_apPending'), approved: t('o_apApproved'), rejected: t('o_apRejected') };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{t('ad_vehicleReview')}</h1>
        <button onClick={load} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors">
          {t('ad_refreshBtn')}
        </button>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-2 mb-6 bg-gray-900 border border-gray-800 rounded-2xl p-1.5">
        {FILTER_TABS.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${filter === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            style={filter === t.id ? { background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-12">{t('o_loading')}</p>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-2xl">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-gray-400">{t('ad_noVehiclesMatch')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vehicles.map(v => (
            <div key={v.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex gap-4">
                {/* 車両画像 */}
                {v.img_url ? (
                  <img src={v.img_url} alt="" className="w-28 h-20 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-28 h-20 bg-gray-800 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">🚗</div>
                )}

                {/* 基本情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-bold">{v.maker} {v.model}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${APPROVAL_BADGE[v.approval_status] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {APPROVAL_LABEL[v.approval_status] ?? v.approval_status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs mb-1">{v.year}{t('od_yearSuffix')} · {v.cls} · {v.type} · {v.loc}</p>
                  <p className="text-purple-400 text-sm font-bold mb-2">¥{(v.price_day ?? 0).toLocaleString()}{t('o_perDay')}</p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                    <span>👤 {t('adx_capacityLabel')} {v.pax}{t('adx_peopleUnit')}</span>
                    <span>⛽ {v.fuel}</span>
                    <span>⚙️ {v.trans}</span>
                    {v.inspection_expiry && <span>🔍 {t('o_inspection')}: {v.inspection_expiry}</span>}
                    {v.license_plate     && <span>🚗 {v.license_plate}</span>}
                    {vehicleOwnerId(v) && (() => {
                      const ownerId = vehicleOwnerId(v);
                      const o = ownerMap[String(ownerId)];
                      return o ? (
                        <span className="text-emerald-400 font-semibold">🏪 {o.store_name}</span>
                      ) : (
                        <span>🏪 {compactId(ownerId)}</span>
                      );
                    })()}
                  </div>

                  {/* 書類リンク */}
                  <div className="flex gap-3 flex-wrap mb-3">
                    <DocumentActionLinks
                      url={v.inspection_cert_url}
                      label="車検証"
                      fileName={`${v.maker ?? 'vehicle'}-${v.model ?? 'car'}-inspection`}
                      onPreview={openDocumentPreview}
                    />
                    <DocumentActionLinks
                      url={v.insurance_cert_url}
                      label="任意保険"
                      fileName={`${v.maker ?? 'vehicle'}-${v.model ?? 'car'}-insurance`}
                      onPreview={openDocumentPreview}
                    />
                  </div>

                  {/* 却下理由（却下済みの場合） */}
                  {v.approval_status === 'rejected' && v.approval_note && (
                    <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded-lg">
                      <p className="text-red-300 text-xs">{t('o_stRejectedReason')} {v.approval_note}</p>
                    </div>
                  )}

                  {/* アクションボタン */}
                  {v.approval_status === 'pending' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => action(v.id, 'approved')}
                        disabled={processing === v.id}
                        className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        {processing === v.id ? t('ad_processing') : t('ad_approve')}
                      </button>
                      <button
                        onClick={() => setRejectId(v.id)}
                        disabled={processing === v.id}
                        className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        {t('adx_rejectBtn')}
                      </button>
                    </div>
                  )}

                  {/* 承認済み → 却下に変更できる */}
                  {v.approval_status === 'approved' && (
                    <button onClick={() => setRejectId(v.id)}
                      className="px-4 py-2 bg-red-900/40 hover:bg-red-800 text-red-300 text-sm font-semibold rounded-xl border border-red-800 transition-colors">
                      {t('ad_changeToReject')}
                    </button>
                  )}

                  {/* 却下済み → 承認に変更できる */}
                  {v.approval_status === 'rejected' && (
                    <button onClick={() => action(v.id, 'approved')}
                      disabled={processing === v.id}
                      className="px-4 py-2 bg-green-900/40 hover:bg-green-700 text-green-300 text-sm font-semibold rounded-xl border border-green-800 transition-colors disabled:opacity-50">
                      {processing === v.id ? t('ad_processing') : t('ad_changeToApprove')}
                    </button>
                  )}

                  {/* 却下モーダル */}
                  {rejectId === v.id && (
                    <div className="mt-3 p-4 bg-gray-800 border border-red-800 rounded-xl">
                      <p className="text-red-300 text-sm font-semibold mb-2">{t('ad_enterRejectReasonShort')}</p>
                      <textarea
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        placeholder={t('ad_phRejectVehicle')}
                        rows={3}
                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-500 mb-3"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => action(v.id, 'rejected', rejectNote)}
                          disabled={processing === v.id}
                          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                          {processing === v.id ? t('ad_processing') : t('ad_sendReject')}
                        </button>
                        <button onClick={() => { setRejectId(null); setRejectNote(''); }}
                          className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-xl hover:bg-gray-600">
                          {t('ar_cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <DocumentPreviewModal
        document={previewDocument}
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  );
}

// ── Legal / Contact pages editor (admin-editable, multilingual) ───────────────
function LegalPagesEditor() {
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const LOCALES = [
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'ko', label: '한국어' },
  ];
  const PAGES = [
    { key: 'privacy', label: t('privacyPolicy') },
    { key: 'terms',   label: t('termsOfUse') },
    { key: 'contact', label: t('contactUs') },
  ];
  const [draft, setDraft] = useState(() => structuredClonePages(state.legalPages));
  const [activePage, setActivePage] = useState('privacy');
  const [activeLocale, setActiveLocale] = useState('ja');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(structuredClonePages(state.legalPages)); }, [state.legalPages]);

  const value = draft?.[activePage]?.[activeLocale] ?? '';
  const setValue = (v) => setDraft(prev => ({
    ...prev,
    [activePage]: { ...(prev?.[activePage] ?? {}), [activeLocale]: v },
  }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await dispatch({ type: 'UPDATE_LEGAL_PAGES', pages: draft });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-2">📄 {t('legalPagesEditor')}</h1>
      <p className="text-gray-400 text-sm mb-6">{t('legalPagesEditorHint')}</p>

      {/* Page selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PAGES.map(p => (
          <button key={p.key} onClick={() => setActivePage(p.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activePage === p.key ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Locale selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {LOCALES.map(l => (
          <button key={l.code} onClick={() => setActiveLocale(l.code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activeLocale === l.code ? 'border-purple-500 bg-purple-900/30 text-purple-200' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            {l.label}
          </button>
        ))}
      </div>

      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={12}
        className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
        placeholder="..."
      />

      <div className="flex items-center gap-3 mt-4">
        <GradBtn theme={state.theme} onClick={save} disabled={saving} className="px-6 py-2.5 text-sm">
          {saving ? t('o_saving') : t('save') || '保存'}
        </GradBtn>
        {saved && <span className="text-green-400 text-sm">✓ {t('saved') || '保存しました'}</span>}
      </div>
    </div>
  );
}

function structuredClonePages(pages) {
  const safe = pages ?? {};
  return {
    privacy: { ...(safe.privacy ?? {}) },
    terms:   { ...(safe.terms ?? {}) },
    contact: { ...(safe.contact ?? {}) },
  };
}
