'use client';
import { useEffect, useState } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import UserMapExplorer from './oneway/UserMapExplorer';
import LoaderOverlay from './LoaderOverlay';

/**
 * ユーザー向け「異地还车ブース」。
 * 車の出発地 → 返却可能な拠点 を地図にアーチ表示。タップで通常予約を開き、
 * 返却場所をプリセットする（opts.crossReturn に受け入れ情報を保存）。
 */
export default function CrossReturnBooth() {
  const { state, dispatch } = useApp();
  const { vehicles, currentUser } = state;
  const { t } = useI18n();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/owner/cross-return?mode=public-listings', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setListings(Array.isArray(d.listings) ? d.listings : []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  const reserve = (listing, search = {}) => {
    if (!currentUser) {
      dispatch({ type: 'SET_AUTH', open: true, mode: 'register' });
      dispatch({ type: 'TOAST', msg: t('authRequiredBooking') });
      return;
    }
    const v = (vehicles ?? []).find(x => String(x.id) === String(listing.vehicleId));
    if (!v) { dispatch({ type: 'TOAST', msg: t('cr_vehicleUnavailable') }); return; }
    const profile = currentUser.bookingProfile ?? {};
    const pickupAt = search.pickupDate ? `${search.pickupDate}T10:00` : '';
    const returnAt = search.returnDate ? `${search.returnDate}T10:00` : '';
    dispatch({
      type: 'SET_BOOKING',
      b: {
        vehicleId: v.id, vehicle: v, bookingType: 'specific', step: 1, type: v.type,
        pickup: pickupAt, ret: returnAt,
        datePreset: Boolean(pickupAt && returnAt),
        retLoc: listing.to?.name ?? '',
        opts: {
          retLoc: listing.to?.name ?? '',
          crossReturn: {
            originOwnerId: listing.originOwnerId,
            receivingOwnerId: listing.receivingOwnerId,
            routePolicy: listing.routePolicy,
            sourceCrossReturnId: listing.sourceCrossReturnId,
            location: listing.to?.name ?? '',
            baseFee: listing.baseFee ?? 0,
            feeMode: listing.feeMode, storagePerDay: listing.storagePerDay,
            splitType: listing.splitType, splitValue: listing.splitValue,
            expectedDays: listing.expectedDays ?? 1,
          },
        },
        info: {
          name: currentUser?.name ?? '', email: currentUser?.email ?? '',
          phone: currentUser?.phone || profile.phone || '', nat: profile.nat ?? currentUser?.nat ?? '',
          license: profile.license ?? currentUser?.license ?? '',
          idpExpiresOn: profile.idpExpiresOn ?? '', idpFileName: profile.idpFileName ?? '',
          channels: profile.channels ?? [], contactHandles: profile.contactHandles ?? {},
        },
      },
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f5f3ff] via-white to-[#f3f0ff] px-4 pb-app-nav pt-appbar-lg">
      <div className="mx-auto max-w-xl">
        <div className="mb-4">
          <button onClick={() => dispatch({ type: 'SET_PAGE', v: 'home' })} className="mb-2 text-xs text-purple-600">← {t('bk_back')}</button>
          <h1 className="flex items-center gap-2 text-xl font-black text-purple-700">
            <span className="flex h-9 w-9 overflow-hidden rounded-xl bg-purple-700 shadow-sm">
              <img src="/best-go-icon.png" alt="" className="h-full w-full object-cover" />
            </span>
            {t('cr_boothTitle')}
          </h1>
          <p className="mt-1 text-xs text-gray-500">{t('cr_boothSub')}</p>
        </div>

        {loading && (
          <div className="app-loader" aria-hidden="true">
            <LoaderOverlay src="/loading-best-go.png" />
          </div>
        )}
        {!loading && (
          listings.length === 0
            ? <p className="rounded-2xl border border-purple-200 bg-white p-8 text-center text-sm text-gray-500">{t('cr_boothEmpty')}</p>
            : <UserMapExplorer listings={listings} onReserve={reserve} />
        )}
      </div>
    </div>
  );
}
