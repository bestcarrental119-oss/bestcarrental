/**
 * POST /api/webhook
 * Stripe Webhook handler.
 *
 * Events handled:
 *   payment_intent.succeeded      → reservation status = 'confirmed'
 *   payment_intent.payment_failed → reservation status = 'failed'
 *   charge.refunded               → reservation status = 'cancelled'
 *
 * Vercel / Next.js: must disable body parsing so we receive raw bytes.
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

export async function POST(req) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  // ── Verify webhook signature ────────────────────────────────────
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // ── Handle events ───────────────────────────────────────────────
  switch (event.type) {

    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const { reservationId } = pi.metadata ?? {};
      console.log(`✅ payment_intent.succeeded: ${pi.id} reservationId=${reservationId}`);

      if (reservationId && supabaseAdmin) {
        const { data: reservation } = await supabaseAdmin
          .from('reservations')
          .select('id, status')
          .eq('id', reservationId)
          .maybeSingle();
        const currentStatus = String(reservation?.status ?? '').toLowerCase();
        const nextStatus = ['in_progress', 'completed', 'cancelled', 'canceled', 'rejected'].includes(currentStatus)
          ? reservation.status
          : 'confirmed';
        const { error } = await supabaseAdmin
          .from('reservations')
          .update({
            status: nextStatus,
            payment_status: 'paid',
            stripe_payment_intent_id: pi.id,
            stripe_paid_amount: Number(pi.amount_received || pi.amount || 0),
          })
          .eq('id', reservationId);

        if (error) {
          console.error('[webhook] Failed to confirm reservation:', error.message);
        } else {
          console.log(`[webhook] Reservation ${reservationId} confirmed ✅`);
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      const { reservationId } = pi.metadata ?? {};
      console.warn(`❌ payment_intent.payment_failed: ${pi.id} — ${pi.last_payment_error?.message}`);

      if (reservationId && supabaseAdmin) {
        await supabaseAdmin
          .from('reservations')
          .update({ status: 'failed' })
          .eq('id', reservationId);
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      console.log(`💸 charge.refunded: ${charge.id}`);

      if (supabaseAdmin) {
        // Find reservation by stripe_payment_intent_id
        const { data: res } = await supabaseAdmin
          .from('reservations')
          .select('id')
          .eq('stripe_payment_intent_id', charge.payment_intent)
          .single();

        if (res?.id) {
          await supabaseAdmin
            .from('reservations')
            .update({ status: 'cancelled' })
            .eq('id', res.id);
          console.log(`[webhook] Reservation ${res.id} cancelled (refunded)`);
        }
      }
      break;
    }

    default:
      console.log(`[webhook] Unhandled event: ${event.type}`);
  }

  return Response.json({ received: true });
}
