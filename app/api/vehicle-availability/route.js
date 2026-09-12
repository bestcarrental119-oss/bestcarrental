/**
 * GET /api/vehicle-availability?vehicleId=xxx&year=2026&month=6
 * その月の予約済み日付範囲を返す
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const year  = parseInt(searchParams.get('year')  ?? new Date().getFullYear());
  const month = parseInt(searchParams.get('month') ?? new Date().getMonth() + 1);

  if (!vehicleId || !supabaseAdmin) return NextResponse.json({ bookedRanges: [] });

  const monthStartIso = new Date(year, month - 1, 1, 0, 0, 0).toISOString();
  const monthEndIso = new Date(year, month, 1, 0, 0, 0).toISOString();

  const { data } = await supabaseAdmin
    .from('reservations')
    .select('pickup_at, return_at, status')
    .eq('vehicle_id', vehicleId)
    .not('status', 'in', '("cancelled","canceled","rejected")')
    .lt('pickup_at', monthEndIso)
    .gt('return_at', monthStartIso);

  const bookedRanges = (data ?? [])
    .filter(r => r.pickup_at && r.return_at)
    .map(r => ({
      from: r.pickup_at.slice(0, 10),
      to:   r.return_at.slice(0, 10),
    }));

  return NextResponse.json({ bookedRanges });
}
