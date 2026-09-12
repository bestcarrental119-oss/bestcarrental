import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json([]);
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const ownerId = searchParams.get('ownerId');

  let query = supabaseAdmin
    .from('one_way_return_locations')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (vehicleId) query = query.or(`vehicle_id.eq.${vehicleId},vehicle_id.is.null`);
  if (ownerId) query = query.eq('owner_id', ownerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { ownerId, vehicleId, name, address, price, active = true } = await req.json();
  if (!ownerId || !name) return NextResponse.json({ error: 'ownerId and name required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('one_way_return_locations')
    .insert({
      owner_id: ownerId,
      vehicle_id: vehicleId ?? null,
      name,
      address: address ?? null,
      price: Number(price) || 0,
      active,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
