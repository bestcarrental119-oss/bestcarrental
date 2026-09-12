/**
 * /api/one-way/listings
 *   GET   → open transfer-car listings (map + list)
 *   POST  → owner publishes a listing (prefilled from the drop-off recommend)
 *   PATCH → update a listing's status (e.g. close)
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { haversineKm, dbToListing, listingReadyForSearch } from '../../../../lib/oneWay';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ listings: [] });
  const { data, error } = await supabaseAdmin
    .from('one_way_listings')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: (data ?? []).filter(listingReadyForSearch).map(dbToListing) });
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const b = await req.json();
    const from = b.from ?? {};
    const to = b.to ?? {};
    const distanceKm = b.distanceKm ?? haversineKm(from.lat, from.lng, to.lat, to.lng);

    const row = {
      owner_id: b.ownerId ?? null,
      owner_auth_id: b.ownerAuthId ?? null,
      vehicle_id: b.vehicleId ?? null,
      maker: b.maker ?? null,
      model: b.model ?? null,
      cls: b.cls ?? 'standard',
      img_url: b.img ?? b.imgUrl ?? null,
      from_name: from.name ?? '',
      from_lat: from.lat ?? null,
      from_lng: from.lng ?? null,
      to_name: to.name ?? '',
      to_lat: to.lat ?? null,
      to_lng: to.lng ?? null,
      distance_km: distanceKm,
      base_price: Math.max(0, Math.round(Number(b.basePrice) || 0)),
      deadline_at: b.deadlineAt ?? null,
      available_from: b.availableFrom ?? new Date().toISOString(),
      insurance_plans: Array.isArray(b.insurancePlans) ? b.insurancePlans : ['waiver', 'waiverPlus', 'perfect'],
      status: 'open',
      custody_status: b.custodyStatus ?? b.custody_status ?? 'received',
      home_owner_id: b.homeOwnerId ?? b.home_owner_id ?? null,
      current_owner_id: b.currentOwnerId ?? b.current_owner_id ?? null,
      route_policy: b.routePolicy ?? b.route_policy ?? null,
      source_cross_return_id: b.sourceCrossReturnId ?? b.source_cross_return_id ?? null,
      service_owner_id: b.serviceOwnerId ?? b.service_owner_id ?? null,
      service_fee_total: Math.max(0, Math.round(Number(b.serviceFeeTotal ?? b.service_fee_total) || 0)),
    };
    if (!row.from_name || !row.to_name) {
      return NextResponse.json({ error: 'from/to store required' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('one_way_listings').insert(row).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ listing: dbToListing(data) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const { id, status, reservedBy, reservationId } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const patch = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (reservedBy !== undefined) patch.reserved_by = reservedBy;
    if (reservationId !== undefined) patch.reservation_id = reservationId;
    const { data, error } = await supabaseAdmin
      .from('one_way_listings').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    if (status === 'reserved' && data?.source_cross_return_id) {
      await supabaseAdmin.from('cross_returns').update({
        home_return_method: 'best_one_way',
        home_return_status: 'one_way_booked',
        home_return_reservation_id: reservationId ?? data.reservation_id ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', data.source_cross_return_id);
    }
    return NextResponse.json({ listing: dbToListing(data) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
