'use client';
/**
 * RunOfFleetCard — highlighted "{t('runOfFleetPlan')}" card for search results
 *
 * Anti-regression: this is a NEW component. It does NOT modify existing
 * VehicleCard or any booking logic. It calls the same SET_BOOKING dispatch
 * that VehicleCard uses, simply with bookingType:'class_based' payload.
 */
import { useApp } from '../lib/context';
import { RUN_OF_FLEET_CLASS_ASSETS, classLabel, classLabelJa, normalizeVehicleClass } from '../lib/runOfFleet';
import { useI18n } from '../lib/i18nContext';
import { useCurrency } from '../lib/currency';

const CLASS_ICONS = {
  kei: 'K',
  compact: 'S',
  standard: 'G',
  suv: 'SUV',
  minivan: 'F1',
  luxury_minivan: 'F2',
  other: 'V',
};


export default function RunOfFleetCard({ vehicle: v }) {
  const { state, dispatch } = useApp();
  const { searchParams } = state;
  const { t, locale } = useI18n();
  const { currency, format } = useCurrency();
  const { pickup, ret } = searchParams ?? {};
  const targetClass = normalizeVehicleClass(v.targetClass ?? v.cls ?? 'standard');
  const localizedClassLabel = locale === 'ja' ? classLabelJa(targetClass) : t(`rofClass_${targetClass}`);

  const openBooking = () => {
    if (!state.currentUser) {
      dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
      dispatch({ type: 'TOAST', msg: t('authRequiredBooking') });
      return;
    }
    const profile = state.currentUser.bookingProfile ?? {};
    dispatch({
      type: 'SET_BOOKING',
      b: {
        vehicleId: null,                      // null until assigned
        vehicle: v,
        bookingType: 'class_based',
        targetClass,
        step: 1,
        type: v.type ?? 'corporate',
        pickup: pickup ?? '',
        ret:    ret    ?? '',
        pickupLoc: v.loc ?? '',
        opts: {},
        info: {
          name:  state.currentUser.name  ?? '',
          email: state.currentUser.email ?? '',
          phone: state.currentUser.phone ?? profile.phone ?? '',
          nat: profile.nat ?? state.currentUser.nat ?? '',
          license: profile.license ?? state.currentUser.license ?? '',
          idpExpiresOn: profile.idpExpiresOn ?? '',
          idpFileName: profile.idpFileName ?? '',
          idpFileDataUrl: profile.idpFileDataUrl ?? '',
          channels: profile.channels ?? [],
          contactHandles: profile.contactHandles ?? {},
        },
      },
    });
  };

  const icon       = CLASS_ICONS[targetClass]   ?? '🚗';
  const desc       = t(`rofDesc_${targetClass}`) || '';
  const discount   = v.originalPriceDay > 0
    ? Math.round((1 - v.priceDay / v.originalPriceDay) * 100)
    : 0;
  const availLabel = v.classAvailable === 1 ? t('remainingOne') : `${t('available')} ${v.classAvailable}${t('carsUnit')}`;
  const asset = RUN_OF_FLEET_CLASS_ASSETS[targetClass] ?? RUN_OF_FLEET_CLASS_ASSETS.standard;

  return (
    <div
      onClick={openBooking}
      className="relative rounded-2xl overflow-hidden cursor-pointer group
                 border-2 border-purple-200 hover:border-purple-500
                 shadow-sm hover:shadow-purple-200/60 hover:shadow-lg
                 transition-all duration-300 hover:-translate-y-1 bg-white"
      style={{ background: 'linear-gradient(145deg, #ffffff 0%, #faf5ff 100%)' }}
    >
      {/* ── Top badge ribbon ─────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 h-1 rounded-t-2xl"
           style={{ background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />

      {/* ── Discount / deal badges ───────────────────────────────── */}
      <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10">
        {discount > 0 && (
          <span className="text-white text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow-md"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            {discount}% OFF
          </span>
        )}
        <span className="bg-white border border-purple-200 text-purple-700 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
          {t('runOfFleetPlan')}
        </span>
      </div>

      {/* ── Availability badge ───────────────────────────────────── */}
      <div className="absolute top-4 right-4 z-10">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
          v.classAvailable === 1
            ? 'bg-red-50 border-red-200 text-red-600'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {availLabel}
        </span>
      </div>

      {/* ── Hero image area ──────────────────────────────────────── */}
      <div className="relative overflow-hidden h-48 bg-gradient-to-b from-gray-100 to-gray-200">
        <img
          src={v.img || v.img_url || 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80'}
          alt={`${classLabel(targetClass)} class vehicle`}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
        />
        {/* Overlay with "車種未定" pill */}
        <div className="absolute inset-0 bg-gradient-to-t from-purple-900/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-white font-bold text-sm leading-tight">
              {localizedClassLabel} {t('classUnit')}
            </p>
            <p className="text-purple-200 text-[11px]">{v.loc} / {t('vehicleAssignedByStoreShort')}</p>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="p-5">
        {/* Store name + class label */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-gray-900 font-bold text-base leading-tight">
              {v.maker} — {localizedClassLabel} {t('runOfFleetPlan')}
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
          </div>
        </div>

        {/* 异地还车（乗り捨て）バッジ — おまかせでも表示 */}
        {Boolean(v.oneWayReturn ?? v.oneway ?? v.allowOneWay ?? v.oneWayEnabled) && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 text-purple-800 border border-purple-300 px-2 py-0.5 text-[11px] font-bold">
              ↔ {t('oneWayReturnAvailable')}
            </span>
          </div>
        )}

        {/* Fleet stats */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4">
          <span className="flex items-center gap-1">
            <span className="text-purple-500">👤</span> {asset.seats}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-500">📍</span> {v.loc}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-500">🏷️</span> {localizedClassLabel}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-purple-500">🔄</span> {t('available')} {v.classAvailable} / {t('total')} {v.fleetTotal}{t('carsUnit')}
          </span>
        </div>

        {/* Tags */}
        {Array.isArray(v.tags) && v.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {v.tags.slice(0, 3).map(tag => (
              <span key={tag}
                    className="text-[11px] bg-purple-50 border border-purple-100 text-purple-700 rounded-lg px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Price row */}
        <div className="flex items-end justify-between pt-3 border-t border-purple-100">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-700">
                {format(v.priceDay ?? 0)}
              </span>
              <span className="text-gray-400 text-xs">{t('perDay')}</span>
            </div>
            {currency !== 'JPY' && (
              <p className="text-gray-400 text-xs">¥{(v.priceDay ?? 0).toLocaleString()}</p>
            )}
            {discount > 0 && (
              <p className="text-gray-400 text-xs line-through">
                {t('regularPrice')} ¥{(v.originalPriceDay ?? 0).toLocaleString()}{t('perDay')}
              </p>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); openBooking(); }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md
                       hover:shadow-purple-300/50 hover:brightness-110 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
          >
            {t('bookNow')}
          </button>
        </div>
      </div>

      {/* ── Bottom info bar ──────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <p className="text-[11px] text-gray-400 flex items-center gap-1">
          <span className="text-purple-400">ℹ️</span>
          {t('vehicleAssignedByStore')}
        </p>
      </div>
    </div>
  );
}
