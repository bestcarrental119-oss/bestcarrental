'use client';

export default function JapanDrivePassCard({ profile = {}, pass = {}, className = '' }) {
  const tier = profile.loyaltyTier ?? profile.loyalty_tier ?? 'bronze';
  const approved = pass.screeningStatus === 'approved' || pass.screening_status === 'approved';
  const initials = (profile.displayName ?? profile.display_name ?? profile.name ?? 'Guest Traveler')
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-violet-200 bg-white text-slate-950 shadow-2xl shadow-violet-950/10 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-500" />
      <div className="grid gap-5 p-6 sm:grid-cols-[auto,1fr]">
        <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 p-1">
          {pass.facePhotoUrl || pass.face_photo_url ? (
            <img src={pass.facePhotoUrl ?? pass.face_photo_url} alt="" className="h-full w-full rounded-[20px] object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-[20px] bg-white/15 text-3xl font-black text-white">{initials}</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-600">Japan Drive Pass</p>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{tier.toUpperCase()}</span>
            {approved && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Verified IDP</span>}
          </div>
          <h3 className="mt-2 truncate text-2xl font-black">{profile.displayName ?? profile.display_name ?? profile.name ?? 'Guest Traveler'}</h3>
          <p className="mt-1 text-sm text-slate-500">Fast Pickup {approved ? 'enabled' : 'available after pre-screening'} · {profile.preferredLanguage ?? profile.preferred_language ?? 'English'}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">IDP</p>
              <p className="text-sm font-black">{approved ? 'Approved' : 'Pending'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Pickup</p>
              <p className="text-sm font-black">{profile.fastPickupEligible || profile.fast_pickup_eligible ? 'Express' : 'Standard'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Trips</p>
              <p className="text-sm font-black">{profile.totalBookings ?? profile.total_bookings ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
