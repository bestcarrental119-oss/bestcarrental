/**
 * GET /api/data
 * Bulk fetch: vehicles + reservations + users for context hydration.
 * Falls back to seed data if Supabase is not configured.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Vercelキャッシュを無効化
import { supabaseAdmin } from '../../../lib/supabase';
import {
  INIT_VEHICLES, INIT_RESERVATIONS, INIT_USERS,
  INIT_PARKING, INIT_THEME,
} from '../../../lib/data';

export async function GET() {
  // ── No Supabase configured → return seed data ────────────────
  if (!supabaseAdmin) {
    return NextResponse.json({
      vehicles:     INIT_VEHICLES,
      reservations: INIT_RESERVATIONS,
      users:        INIT_USERS,
      parking:      INIT_PARKING,
      theme:        INIT_THEME,
      _source:      'seed',
    })
  }

  try {
    const [vRes, rRes, uRes, oRes] = await Promise.all([
      supabaseAdmin.from('vehicles').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('reservations').select('*').order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('*'),
      supabaseAdmin.from('owners').select('*'),
    ]);

    if (vRes.error) throw vRes.error;
    if (rRes.error) throw rRes.error;

    // ── Map DB snake_case → frontend camelCase ───────────────────
    const ownerChatById = buildOwnerChatMap(oRes.data ?? []);
    const vehicles = (vRes.data ?? []).map(v => dbToVehicle(v, ownerChatById));
    const reservations = (rRes.data ?? []).map(dbToReservation);

    console.log('[api/data] uRes.data:', uRes.data, 'uRes.error:', uRes.error);

    return NextResponse.json({
      vehicles,
      reservations,
      users:   (uRes.data && uRes.data.length > 0) ? uRes.data : INIT_USERS,
      parking: INIT_PARKING, // parking stays in seed for now
      theme:   INIT_THEME,
      _usersDebug: { count: uRes.data?.length, error: uRes.error?.message },
      _source: 'supabase',
    });
  } catch (e) {
    console.error('[api/data] Supabase error, falling back to seed:', e.message);
    return NextResponse.json({
      vehicles:     INIT_VEHICLES,
      reservations: INIT_RESERVATIONS,
      users:        INIT_USERS,
      parking:      INIT_PARKING,
      theme:        INIT_THEME,
      _source:      'seed_fallback',
    })
  }
}

// ── DB → Frontend field mapping ──────────────────────────────────
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
  const feeFields = Object.fromEntries(
    Object.entries(fees).map(([code, fee]) => [`airportFee_${code}`, fee])
  );
  const preBookingChatEnabled = Boolean(
    ownerChatById.get(String(v.owner_id ?? '')) ??
    ownerChatById.get(String(v.owner_auth_id ?? '')) ??
    false
  );
  return {
    id:                v.id,
    maker:             v.maker,
    model:             v.model,
    year:              v.year,
    grade:             v.grade,
    cls:               v.cls,
    type:              v.type,
    pax:               v.pax,
    fuel:              v.fuel,
    trans:             v.trans,
    priceDay:          v.price_day,
    priceHour:         v.price_hour,
    deposit:           v.deposit,
    insurance:         v.insurance,
    rating:            Number(v.rating),
    reviews:           v.reviews,
    loc:               v.loc,
    lat:               v.lat,
    lng:               v.lng,
    img:               v.img_url,
    inspectionCertUrl: v.inspection_cert_url,
    insuranceCertUrl:  v.insurance_cert_url,
    inspectionExpiry:  v.inspection_expiry,
    badge:             v.badge,
    badgeBg:           v.badge_bg,
    tags:              v.tags ?? [],
    status:            v.status,
    oneWayEnabled:     v.one_way_enabled,
    airports:          v.airports ?? [],
    preBookingChatEnabled,
    holder:            v.holder,
    ownerId:           v.owner_id ?? null,
    ownerAuthId:       v.owner_auth_id ?? null,
    ...feeFields,
  };
}

function dbToReservation(r) {
  return {
    id:        r.id,
    vehicleId: r.vehicle_id,
    ownerId:   r.owner_id,
    userId:    r.user_id,
    pickup:    r.pickup_at,
    ret:       r.return_at,
    days:      r.days,
    total:     r.total,
    status:    r.status,
    type:      r.type,
    opts:      r.opts ?? {},
    pickupLoc: r.pickup_loc,
    retLoc:    r.return_loc,
    bookingType: r.booking_type ?? 'specific',
    targetClass: r.target_class,
    assignmentStatus: r.assignment_status ?? (r.vehicle_id ? 'assigned' : 'pending_assignment'),
  };
}
