/**
 * GET /api/cron/auto-review
 *
 * Cron job: auto-complete reservations where review_deadline has passed.
 * - Finds reservations in 'waiting_review' status past their deadline
 * - Inserts star-5 auto reviews for whichever side(s) haven't reviewed
 * - Sets reservation status = 'completed', payout_enabled = true
 *
 * Schedule: Run once daily (e.g. Vercel Cron: "0 2 * * *")
 * Protected by CRON_SECRET header.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export async function GET(req) {
  // ── Auth guard ────────────────────────────────────────────────
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const now = new Date().toISOString();

  // ── 1. Find expired reservations awaiting reviews ─────────────
  const { data: expired, error: fetchErr } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, vehicle_id')
    .eq('status', 'waiting_review')
    .lt('review_deadline', now);

  if (fetchErr) {
    console.error('[auto-review] fetch error:', fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No expired reservations found' });
  }

  let processed = 0;

  for (const res of expired) {
    // ── 2. Check which sides have already reviewed ──────────────
    const { data: existingReviews } = await supabaseAdmin
      .from('reviews')
      .select('reviewer_role')
      .eq('reservation_id', res.id);

    const doneRoles = (existingReviews ?? []).map(r => r.reviewer_role);

    const autoReviews = [];

    // Auto-review for customer if not done
    if (!doneRoles.includes('customer')) {
      autoReviews.push({
        reservation_id: res.id,
        reviewer_id:    res.user_id,
        reviewee_id:    null,         // host/vehicle has no UUID in current schema
        reviewer_role:  'customer',
        rating:         5,
        comment:        'Auto-completed: no review submitted within 14 days.',
        is_auto:        true,
      });
    }

    // Auto-review for host if not done
    if (!doneRoles.includes('host')) {
      autoReviews.push({
        reservation_id: res.id,
        reviewer_id:    null,
        reviewee_id:    res.user_id,
        reviewer_role:  'host',
        rating:         5,
        comment:        'Auto-completed: no review submitted within 14 days.',
        is_auto:        true,
      });
    }

    // ── 3. Insert missing auto reviews ─────────────────────────
    if (autoReviews.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('reviews')
        .insert(autoReviews);

      if (insertErr) {
        console.error(`[auto-review] insert error for ${res.id}:`, insertErr.message);
        continue;
      }
    }

    // ── 4. Complete the reservation + enable payout ─────────────
    const { error: updateErr } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'completed', payout_enabled: true })
      .eq('id', res.id);

    if (updateErr) {
      console.error(`[auto-review] update error for ${res.id}:`, updateErr.message);
      continue;
    }

    console.log(`[auto-review] ✅ Auto-completed reservation ${res.id}`);
    processed++;
  }

  return NextResponse.json({
    processed,
    total: expired.length,
    message: `Auto-completed ${processed}/${expired.length} reservations`,
  });
}
