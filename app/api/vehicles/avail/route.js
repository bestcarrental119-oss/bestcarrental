import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { getReservations, getVehicles } from '../../../../lib/kv';
import { buildClassVirtualListings, isSpecificVehicleAvailable, normalizeVehicleClass } from '../../../../lib/runOfFleet';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pickup = searchParams.get('pickup') ?? '';
  const ret = searchParams.get('ret') ?? '';
  const cls = searchParams.get('cls') ?? 'all';
  const query = (searchParams.get('query') ?? '').trim().toLowerCase();
  const airportCode = searchParams.get('airportCode') ?? '';

  if (!supabaseAdmin) {
    const [vehicles, reservations] = await Promise.all([getVehicles(), getReservations()]);
    const specificListings = filterSpecificVehicles({ vehicles, reservations, pickup, ret, cls, query, airportCode });
    const classListings = buildClassVirtualListings({
      vehicles,
      reservations,
      pickup,
      ret,
      selectedClass: cls,
      airportCode,
    });
    return NextResponse.json({ listings: [...classListings, ...specificListings] });
  }

  const [vRes, rRes, oRes] = await Promise.all([
    supabaseAdmin.from('vehicles').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('reservations').select('*'),
    supabaseAdmin.from('owners').select('*'),
  ]);

  if (vRes.error) return NextResponse.json({ error: vRes.error.message }, { status: 500 });
  if (rRes.error) return NextResponse.json({ error: rRes.error.message }, { status: 500 });

  const owners = oRes.data ?? [];
  const ownerChatById = buildOwnerChatMap(owners);
  const vehicles = (vRes.data ?? []).map(v => dbToVehicle(v, ownerChatById));
  const reservations = rRes.data ?? [];
  const specificListings = filterSpecificVehicles({ vehicles, reservations, pickup, ret, cls, query, airportCode });
  const classListings = buildClassVirtualListings({
    vehicles,
    reservations,
    owners,
    pickup,
    ret,
    selectedClass: cls,
    airportCode,
  });

  return NextResponse.json({ listings: [...classListings, ...specificListings] });
}

function filterSpecificVehicles({ vehicles, reservations, pickup, ret, cls, query, airportCode }) {
  return (vehicles ?? []).filter(v => {
    const approvalStatus = v.approvalStatus ?? v.approval_status ?? 'approved';
    if ((v.status ?? 'active') !== 'active' || approvalStatus !== 'approved') return false;
    if (cls && cls !== 'all' && normalizeVehicleClass(v.cls) !== normalizeVehicleClass(cls)) return false;
    if (airportCode && !(Array.isArray(v.airports) && v.airports.includes(airportCode))) return false;
    if (query) {
      const haystack = `${v.maker ?? ''} ${v.model ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (pickup && ret) {
      return isSpecificVehicleAvailable({ vehicleId: v.id, reservations, pickup, ret });
    }
    return true;
  }).map(v => ({ ...v, listingType: 'specific', bookingType: 'specific', vehicleId: v.id }));
}

function buildOwnerChatMap(owners) {
  const ownerChatById = new Map();
  (owners ?? []).forEach(owner => {
    const enabled = Boolean(owner.pre_booking_chat_enabled ?? owner.preBookingChatEnabled);
    [owner.id, owner.user_id].filter(Boolean).forEach(id => ownerChatById.set(String(id), enabled));
  });
  return ownerChatById;
}

function dbToVehicle(v, ownerChatById = new Map()) {
  const fees = v.airport_fees ?? {};
  const preBookingChatEnabled = Boolean(
    ownerChatById.get(String(v.owner_id ?? '')) ??
    ownerChatById.get(String(v.owner_auth_id ?? '')) ??
    false
  );
  return {
    id: v.id,
    maker: v.maker,
    model: v.model,
    year: v.year,
    grade: v.grade,
    cls: v.cls,
    type: v.type,
    pax: v.pax,
    fuel: v.fuel,
    trans: v.trans,
    priceDay: v.price_day,
    price_day: v.price_day,
    priceHour: v.price_hour,
    deposit: v.deposit,
    insurance: v.insurance,
    rating: Number(v.rating ?? 4.5),
    reviews: v.reviews ?? 0,
    loc: v.loc,
    lat: v.lat,
    lng: v.lng,
    img: v.img_url,
    img_url: v.img_url,
    badge: v.badge,
    badgeBg: v.badge_bg,
    tags: v.tags ?? [],
    status: v.status,
    approvalStatus: v.approval_status,
    approval_status: v.approval_status,
    oneWayEnabled: v.one_way_enabled,
    preBookingChatEnabled,
    airports: v.airports ?? [],
    holder: v.holder,
    ownerId: v.owner_id ?? null,
    owner_id: v.owner_id ?? null,
    ownerAuthId: v.owner_auth_id ?? null,
    owner_auth_id: v.owner_auth_id ?? null,
    ...Object.fromEntries(Object.entries(fees).map(([c, f]) => [`airportFee_${c}`, f])),
  };
}
