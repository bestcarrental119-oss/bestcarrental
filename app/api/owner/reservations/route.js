import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 });

  const { data: owner } = await supabaseAdmin
    .from('owners')
    .select('id, user_id')
    .or(`id.eq.${ownerId},user_id.eq.${ownerId}`)
    .maybeSingle();
  const ownerLookupIds = [...new Set([ownerId, owner?.id, owner?.user_id].filter(Boolean).map(String))];

  // Step1: このオーナーの車両IDを全て取得
  const { data: vehicles, error: vErr } = await supabaseAdmin
    .from('vehicles')
    .select('id, maker, model, img_url, year, price_day, cls, license_plate')
    .in('owner_id', ownerLookupIds);

  if (vErr) {
    console.error('[owner/reservations] vehicles query error:', vErr.message);
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  const vehicleIds = (vehicles ?? []).map(v => v.id).filter(Boolean);
  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]));

  console.log(`[owner/reservations] ownerId=${ownerId}, lookupIds=${JSON.stringify(ownerLookupIds)}, vehicleIds=${JSON.stringify(vehicleIds)}`);

  // Step2: 車両IDに紐づく予約を取得
  const byVehicleQuery = supabaseAdmin
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: reservations, error: rErr } = vehicleIds.length > 0
    ? await byVehicleQuery.in('vehicle_id', vehicleIds)
    : { data: [], error: null };

  if (rErr) {
    console.error('[owner/reservations] reservations query error:', rErr.message);
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  // Step3: owner_id でも追加検索（念のため）
  const { data: byOwnerId } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .in('owner_id', ownerLookupIds)
    .order('created_at', { ascending: false });

  // 重複を除いてマージ
  const allRes = [...(reservations ?? [])];
  (byOwnerId ?? []).forEach(r => {
    if (!allRes.find(x => x.id === r.id)) allRes.push(r);
  });

  console.log(`[owner/reservations] found ${allRes.length} reservations`);

  // 車両情報をマッピング
  const result = allRes.map(r => ({
    ...r,
    vehicle: vehicleMap[r.vehicle_id] ?? null,
    booking_type: r.booking_type ?? (r.vehicle_id ? 'specific' : 'class_based'),
    assignment_status: r.assignment_status ?? (r.vehicle_id ? 'assigned' : 'pending_assignment'),
  }));

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
}
