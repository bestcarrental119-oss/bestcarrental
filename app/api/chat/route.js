import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
export const dynamic = 'force-dynamic';

async function resolveOwnerLookupIds(ownerUserId) {
  if (!ownerUserId) return [];
  const { data } = await supabaseAdmin
    .from('owners')
    .select('id, user_id')
    .or(`id.eq.${ownerUserId},user_id.eq.${ownerUserId}`);
  const ids = [ownerUserId];
  for (const owner of data ?? []) {
    if (owner.id) ids.push(owner.id);
    if (owner.user_id) ids.push(owner.user_id);
  }
  return [...new Set(ids)];
}

async function assertPreBookingChatAllowed({ vehicleId, userId, ownerLookupIds }) {
  const { data: existingReservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('user_id', userId)
    .limit(1);
  if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 });
  if ((existingReservation ?? []).length > 0) return null;

  const { data: vehicle, error: vehicleError } = await supabaseAdmin
    .from('vehicles')
    .select('id, owner_id, owner_auth_id')
    .eq('id', vehicleId)
    .maybeSingle();
  if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 });
  if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const vehicleOwnerIds = [vehicle.owner_id, vehicle.owner_auth_id].filter(Boolean).map(String);
  if (vehicleOwnerIds.length > 0 && !vehicleOwnerIds.some(id => ownerLookupIds.includes(id))) {
    return NextResponse.json({ error: 'Vehicle owner mismatch' }, { status: 403 });
  }

  const ownerFilter = ownerLookupIds.flatMap(id => [`id.eq.${id}`, `user_id.eq.${id}`]).join(',');
  const { data: ownerRows, error: ownerError } = await supabaseAdmin
    .from('owners')
    .select('id, user_id, pre_booking_chat_enabled')
    .or(ownerFilter)
    .limit(1);
  if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
  if (!ownerRows?.some(owner => owner.pre_booking_chat_enabled)) {
    return NextResponse.json({ error: 'Pre-booking chat is not enabled for this owner' }, { status: 403 });
  }
  return null;
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const role   = searchParams.get('role') ?? 'user';
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  let query = supabaseAdmin
    .from('conversations')
    .select('*, vehicle:vehicles(id, maker, model, img_url), messages(id, content, detected_lang, sender_role, created_at, is_read)')
    .order('updated_at', { ascending: false });

  if (role === 'owner') {
    const ownerLookupIds = await resolveOwnerLookupIds(userId);
    query = query.in('owner_user_id', ownerLookupIds);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { vehicleId, userId, ownerUserId } = await req.json();
  if (!vehicleId || !userId || !ownerUserId)
    return NextResponse.json({ error: 'vehicleId, userId, ownerUserId required' }, { status: 400 });
  const ownerLookupIds = await resolveOwnerLookupIds(ownerUserId);
  if (ownerLookupIds.length === 0) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
  const { data: existingRows } = await supabaseAdmin
    .from('conversations').select('*')
    .eq('vehicle_id', vehicleId).eq('user_id', userId).in('owner_user_id', ownerLookupIds)
    .limit(1);
  const existing = existingRows?.[0];
  if (existing) return NextResponse.json(existing);
  const preBookingBlock = await assertPreBookingChatAllowed({ vehicleId, userId, ownerLookupIds });
  if (preBookingBlock) return preBookingBlock;
  const ownerAuthId = ownerLookupIds.find(id => id !== ownerUserId) ?? ownerUserId;
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({ vehicle_id: vehicleId, user_id: userId, owner_user_id: ownerAuthId })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
