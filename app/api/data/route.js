import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import { supabaseAdmin } from '../../../lib/supabase';
import { INIT_VEHICLES, INIT_RESERVATIONS, INIT_USERS, INIT_PARKING, INIT_THEME, INIT_HERO_BANNERS } from '../../../lib/data';
import { getHeroBanners } from '../../../lib/kv';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

export async function GET() {
  const heroBanners = await getHeroBanners();
  if (!supabaseAdmin) {
    return NextResponse.json({ vehicles: INIT_VEHICLES, reservations: INIT_RESERVATIONS, users: INIT_USERS, owners: [], parking: INIT_PARKING, theme: INIT_THEME, heroBanners, _source: 'seed' }, { headers: NO_CACHE });
  }
  try {
    const [vRes, rRes, uRes, oRes] = await Promise.all([
      // フロントエンドには approved のみ返す
      supabaseAdmin.from('vehicles').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('reservations').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('owners').select('*'),
    ]);
    if (vRes.error) throw vRes.error;
    if (rRes.error) throw rRes.error;
    const ownerChatById = buildOwnerChatMap(oRes.data ?? []);
    return NextResponse.json({
      vehicles:     (vRes.data ?? []).map(v => dbToVehicle(v, ownerChatById)),
      reservations: (rRes.data ?? []).map(dbToReservation),
      users:        (uRes.data && uRes.data.length > 0) ? uRes.data : INIT_USERS,
      owners:       (oRes.data ?? []).filter(o => o.status === 'approved').map(dbToOwnerStore),
      parking:      INIT_PARKING,
      theme:        INIT_THEME,
      heroBanners,
      _source:      'supabase',
    }, { headers: NO_CACHE });
  } catch (e) {
    console.error('[api/data] fallback to seed:', e.message);
    return NextResponse.json({ vehicles: INIT_VEHICLES, reservations: INIT_RESERVATIONS, users: INIT_USERS, owners: [], parking: INIT_PARKING, theme: INIT_THEME, heroBanners: INIT_HERO_BANNERS, _source: 'seed_fallback' }, { headers: NO_CACHE });
  }
}

function buildOwnerChatMap(owners) {
  const ownerChatById = new Map();
  (owners ?? []).forEach(owner => {
    const enabled = Boolean(owner.pre_booking_chat_enabled ?? owner.preBookingChatEnabled);
    [owner.id, owner.user_id].filter(Boolean).forEach(id => ownerChatById.set(String(id), enabled));
  });
  return ownerChatById;
}

function dbToOwnerStore(o) {
  return {
    id: o.id,
    userId: o.user_id ?? null,
    storeName: o.store_name ?? '',
    storeLocation: o.store_location ?? '',
    status: o.status ?? '',
    businessType: o.business_type ?? '',
    parentOwnerId: o.parent_owner_id ?? null,
  };
}

function dbToVehicle(v, ownerChatById = new Map()) {
  const fees = v.airport_fees ?? {};
  const preBookingChatEnabled = Boolean(
    ownerChatById.get(String(v.owner_id ?? '')) ??
    ownerChatById.get(String(v.owner_auth_id ?? '')) ??
    false
  );
  return {
    id: v.id, maker: v.maker, model: v.model, year: v.year, grade: v.grade,
    cls: v.cls, type: v.type, pax: v.pax, fuel: v.fuel, trans: v.trans,
    priceDay: v.price_day, priceHour: v.price_hour, deposit: v.deposit, insurance: v.insurance,
    insurancePlans: v.insurance_plans ?? null,
    largeSuitcases: v.large_suitcases ?? v.largeSuitcases ?? 0,
    smallBags: v.small_bags ?? v.smallBags ?? 0,
    rating: Number(v.rating ?? 4.5), reviews: v.reviews ?? 0,
    loc: v.loc, lat: v.lat, lng: v.lng, img: v.img_url,
    inspectionCertUrl: v.inspection_cert_url, insuranceCertUrl: v.insurance_cert_url,
    inspectionExpiry: v.inspection_expiry, licensePlate: v.license_plate,
    badge: v.badge, badgeBg: v.badge_bg, tags: v.tags ?? [],
    status: v.status, approvalStatus: v.approval_status,
    oneWayEnabled: v.one_way_enabled, airports: v.airports ?? [],
    preBookingChatEnabled,
    holder: v.holder, ownerId: v.owner_id ?? null, ownerAuthId: v.owner_auth_id ?? null,
    ...Object.fromEntries(Object.entries(fees).map(([c, f]) => [`airportFee_${c}`, f])),
  };
}
function dbToReservation(r) {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    ownerId: r.owner_id,
    userId: r.user_id,
    pickup: r.pickup_at,
    ret: r.return_at,
    days: r.days,
    total: r.total,
    stripePaidAmount: r.stripe_paid_amount,
    status: r.status,
    type: r.type,
    opts: r.opts ?? {},
    pickupLoc: r.pickup_loc,
    retLoc: r.return_loc,
    bookingType: r.booking_type ?? 'specific',
    targetClass: r.target_class,
    assignmentStatus: r.assignment_status ?? (r.vehicle_id ? 'assigned' : 'pending_assignment'),
  };
}
