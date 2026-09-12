/**
 * GET /api/checkout/confirm?res=RESERVATION_ID
 *
 * Webhook fallback for Stripe Checkout (Apple Pay / Google Pay). When the user
 * returns from checkout.stripe.com we call this to make sure the reservation is
 * confirmed even if the payment_intent.succeeded webhook is delayed or not
 * configured. It looks up the reservation, and if it isn't confirmed yet, asks
 * Stripe whether a matching PaymentIntent has actually succeeded (matched by
 * metadata.reservationId) before flipping the status to 'confirmed'.
 *
 * Always returns the reservation (mapped for the client) so the user's booking
 * shows up in "My Reservations" regardless — a paid customer must never see an
 * empty list.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };
const CONFIRMED_STATUSES = new Set(['confirmed', 'pending_assignment', 'in_progress', 'completed']);

function toClient(r) {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    ownerId: r.owner_id,
    userId: r.user_id,
    pickup: r.pickup_at,
    ret: r.return_at,
    days: r.days,
    total: r.total,
    status: r.status,
    paymentStatus: r.payment_status,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    stripePaidAmount: r.stripe_paid_amount,
    type: r.type,
    opts: r.opts ?? {},
    pickupLoc: r.pickup_loc,
    retLoc: r.return_loc,
    bookingType: r.booking_type ?? 'specific',
    targetClass: r.target_class,
    assignmentStatus: r.assignment_status ?? (r.vehicle_id ? 'assigned' : 'pending_assignment'),
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
  };
}

// Ask Stripe whether a PaymentIntent for this reservation actually succeeded.
async function findSucceededPaymentIntent(reservationId) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    // PaymentIntent search (metadata is indexed). Falls back gracefully on error.
    const found = await stripe.paymentIntents.search({
      query: `metadata['reservationId']:'${reservationId}' AND status:'succeeded'`,
      limit: 1,
    });
    return found?.data?.[0] ?? null;
  } catch (e) {
    console.warn('[checkout/confirm] Stripe lookup failed:', e.message);
    return null;
  }
}

// setup モードの Checkout セッションから顧客・カードを取り出して予約を「予約確定＋
// 受取7日前に自動課金」状態にする（ウォレットの後日決済対応）。
async function handleSetupSession(cs, reservation) {
  if (!cs || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const session = await stripe.checkout.sessions.retrieve(cs, { expand: ['setup_intent'] });
    if (session.mode !== 'setup') return null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const pm = session.setup_intent?.payment_method;
    const paymentMethodId = typeof pm === 'string' ? pm : pm?.id;
    if (!customerId || !paymentMethodId) return null;
    const pickup = reservation.pickup_at ? new Date(reservation.pickup_at).getTime() : NaN;
    const chargeAt = Number.isFinite(pickup) ? new Date(pickup - 7 * 24 * 60 * 60 * 1000).toISOString() : null;
    const { data: updated } = await supabaseAdmin
      .from('reservations')
      .update({
        status: 'confirmed',
        payment_status: 'scheduled',
        stripe_customer_id: customerId,
        stripe_payment_method_id: paymentMethodId,
        charge_at: chargeAt,
      })
      .eq('id', reservation.id)
      .select()
      .single();
    return updated ?? reservation;
  } catch (e) {
    console.warn('[checkout/confirm] setup session handling failed:', e.message);
    return null;
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('res');
  const cs = searchParams.get('cs');
  if (!reservationId) return NextResponse.json({ error: 'res required' }, { status: 400, headers: NO_CACHE });
  if (!supabaseAdmin) return NextResponse.json({ confirmed: false, demo: true }, { headers: NO_CACHE });

  const { data: r, error } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  if (!r) return NextResponse.json({ found: false }, { status: 404, headers: NO_CACHE });

  // ウォレットの後日決済（setup セッション）: カード保存＋7日前課金を予約に反映
  if (cs) {
    const scheduled = await handleSetupSession(cs, r);
    if (scheduled) {
      return NextResponse.json({ found: true, confirmed: true, scheduled: true, reservation: toClient(scheduled) }, { headers: NO_CACHE });
    }
  }

  // Already confirmed — nothing to do.
  if (CONFIRMED_STATUSES.has(String(r.status ?? '').toLowerCase())) {
    return NextResponse.json({ found: true, confirmed: true, reservation: toClient(r) }, { headers: NO_CACHE });
  }

  // Not confirmed yet: verify payment with Stripe before flipping the status.
  const pi = await findSucceededPaymentIntent(reservationId);
  if (pi) {
    const { data: updated } = await supabaseAdmin
      .from('reservations')
      .update({
        status: 'confirmed',
        stripe_payment_intent_id: pi.id,
        stripe_paid_amount: Number(pi.amount_received || pi.amount || 0) || r.stripe_paid_amount || null,
        payment_status: 'paid',
      })
      .eq('id', reservationId)
      .select()
      .single();
    return NextResponse.json({ found: true, confirmed: true, reservation: toClient(updated ?? r) }, { headers: NO_CACHE });
  }

  // Payment not verified yet (webhook may still be in flight). Still return the
  // reservation so it appears in the user's list.
  return NextResponse.json({ found: true, confirmed: false, reservation: toClient(r) }, { headers: NO_CACHE });
}
