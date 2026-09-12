/**
 * POST /api/one-way/capture
 * Owner/admin action at return time.
 *   action: 'capture' → charge base + insurance (+ fuel fee if not refuelled),
 *                        releasing the rest of the deposit hold.
 *   action: 'release' → cancel the hold entirely (no charge).
 *
 * Body: { reservationId, action: 'capture'|'release', refuelled?:bool }
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';
import { FUEL_REFUEL_FEE } from '../../../../lib/oneWay';

export const dynamic = 'force-dynamic';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

export async function POST(req) {
  if (!supabaseAdmin) return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const { reservationId, action = 'capture', refuelled = true } = await req.json();
    if (!reservationId) return Response.json({ error: 'reservationId required' }, { status: 400 });

    const { data: r, error } = await supabaseAdmin
      .from('reservations')
      .select('id, total, opts, stripe_payment_intent_id, status')
      .eq('id', reservationId).single();
    if (error || !r) return Response.json({ error: 'Reservation not found' }, { status: 404 });
    if (!r.stripe_payment_intent_id) return Response.json({ error: 'No payment hold on this reservation' }, { status: 400 });

    if (action === 'release') {
      if (process.env.STRIPE_SECRET_KEY) {
        await stripe.paymentIntents.cancel(r.stripe_payment_intent_id).catch(() => {});
      }
      await supabaseAdmin.from('reservations')
        .update({ status: 'cancelled', payment_status: 'released' })
        .eq('id', r.id);
      return Response.json({ ok: true, action: 'release', captured: 0 });
    }

    // capture = base + insurance (+ fuel handling fee if the tank was not refuelled)
    const base = Number(r.opts?.basePrice ?? 0);
    const ins = Number(r.opts?.insuranceAmount ?? 0);
    const fuelFee = refuelled ? 0 : FUEL_REFUEL_FEE;
    const captureAmount = Math.max(50, base + ins + fuelFee);

    if (process.env.STRIPE_SECRET_KEY) {
      await stripe.paymentIntents.capture(r.stripe_payment_intent_id, {
        amount_to_capture: captureAmount,
      });
    }
    await supabaseAdmin.from('reservations')
      .update({ status: 'completed', payment_status: 'captured', stripe_paid_amount: captureAmount })
      .eq('id', r.id);

    return Response.json({ ok: true, action: 'capture', captured: captureAmount, fuelFee });
  } catch (e) {
    console.error('[one-way/capture]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
