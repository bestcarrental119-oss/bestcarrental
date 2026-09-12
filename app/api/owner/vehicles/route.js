import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  const userId = searchParams.get('userId');
  if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 });

  const { data: owner } = await supabaseAdmin
    .from('owners')
    .select('id, user_id')
    .or(`id.eq.${ownerId},user_id.eq.${ownerId}`)
    .maybeSingle();
  const ownerLookupIds = [...new Set([ownerId, userId, owner?.id, owner?.user_id].filter(Boolean).map(String))];

  const mergeVehicleRows = (...groups) => {
    const byId = new Map();
    groups.flat().filter(Boolean).forEach(vehicle => {
      const key = String(vehicle.id);
      if (!byId.has(key)) byId.set(key, vehicle);
    });
    return [...byId.values()].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
  };

  // オーナーは自分の全車両（全審査ステータス）を見られる
  const [byOwnerId, byOwnerAuthId] = await Promise.all([
    supabaseAdmin
      .from('vehicles')
      .select('*')
      .in('owner_id', ownerLookupIds)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('vehicles')
      .select('*')
      .in('owner_auth_id', ownerLookupIds)
      .order('created_at', { ascending: false }),
  ]);

  const hardError = byOwnerId.error || byOwnerAuthId.error;
  if (hardError) return NextResponse.json({ error: hardError.message }, { status: 500, headers: NO_CACHE });
  return NextResponse.json(mergeVehicleRows(byOwnerId.data ?? [], byOwnerAuthId.data ?? []), { headers: NO_CACHE });
}
