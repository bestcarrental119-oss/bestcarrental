/**
 * GET /api/reviews/public?vehicleId=xxx
 *
 * Public customer→store/vehicle reviews for FUTURE renters to read.
 * Only reviews that are (a) written by customers, (b) not hidden by admin,
 * and (c) revealed (both sides reviewed OR review_deadline passed) are returned.
 *
 * Response: { reviews: [{ rating, comment, created_at }], avg, count }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ reviews: [], avg: null, count: 0 });

  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 });

  // Reservations for this vehicle
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('id, review_deadline')
    .eq('vehicle_id', vehicleId);
  const resIds = (reservations ?? []).map(r => r.id);
  if (resIds.length === 0) return NextResponse.json({ reviews: [], avg: null, count: 0 });

  // Count reviews per reservation to determine "both reviewed"
  const { data: all } = await supabaseAdmin
    .from('reviews')
    .select('reservation_id, reviewer_role, rating, comment, created_at, is_hidden')
    .in('reservation_id', resIds);

  const perRes = {};
  for (const r of all ?? []) {
    (perRes[r.reservation_id] ??= []).push(r);
  }
  const deadlineMap = Object.fromEntries((reservations ?? []).map(r => [r.id, r.review_deadline]));
  const now = new Date();

  const visible = (all ?? []).filter(r => {
    if (r.reviewer_role !== 'customer') return false;   // only customer→store reviews are public
    if (r.is_hidden) return false;                      // admin-hidden excluded
    const both = (perRes[r.reservation_id] ?? []).length >= 2;
    const dl = deadlineMap[r.reservation_id] ? new Date(deadlineMap[r.reservation_id]) : null;
    const expired = dl && now > dl;
    return both || expired;                             // double-blind reveal rule
  });

  const count = visible.length;
  const avg = count ? visible.reduce((s, r) => s + (r.rating || 0), 0) / count : null;

  return NextResponse.json({
    reviews: visible
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(r => ({ rating: r.rating, comment: r.comment, created_at: r.created_at })),
    avg,
    count,
  });
}
