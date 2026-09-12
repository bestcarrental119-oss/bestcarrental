/**
 * GET /api/reservations/check?vehicleId=xxx&pickup=ISO&ret=ISO
 * 指定車両・期間が空いているか確認する
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ available: true });

  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const pickup    = searchParams.get('pickup');
  const ret       = searchParams.get('ret');

  if (!vehicleId || !pickup || !ret) {
    return NextResponse.json({ error: 'vehicleId, pickup, ret required' }, { status: 400 });
  }

  const { data: conflicts } = await supabaseAdmin
    .from('reservations')
    .select('id, pickup_at, return_at')
    .eq('vehicle_id', vehicleId)
    .not('status', 'in', '("cancelled","rejected")')
    .lt('pickup_at', ret)
    .gt('return_at', pickup);

  const available = (conflicts ?? []).length === 0;

  return NextResponse.json({
    available,
    conflicts: (conflicts ?? []).map(r => ({
      pickup: r.pickup_at?.slice(0, 10),
      ret:    r.return_at?.slice(0, 10),
    })),
  });
}
