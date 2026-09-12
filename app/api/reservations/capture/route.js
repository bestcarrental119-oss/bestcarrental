/**
 * POST /api/reservations/capture
 *
 * Captures the full rental amount from a normal reservation authorization at
 * pickup time. The 7-day cron creates the manual-capture PaymentIntent; this
 * endpoint settles it when the car is handed over.
 *
 * Body: { reservationId, status?: 'in_progress' | 'confirmed' }
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';
import {
  AUTHORIZED_PAYMENT_STATUS,
  stripeIdempotencyKey,
} from '../../../../lib/paymentAuthorization';
import { hasCompleteDepartureInspectionPhotos } from '../../../../lib/inspectionPhotos';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });
const CLOSED_STATUSES = new Set(['cancelled', 'canceled', 'rejected']);

async function hasCompleteDepartureInspection(reservationId) {
  const { data } = await supabaseAdmin
    .from('damage_inspections')
    .select('photos')
    .eq('reservation_id', reservationId)
    .maybeSingle();
  return hasCompleteDepartureInspectionPhotos(data?.photos ?? {});
}

export async function POST(req) {
  if (!supabaseAdmin) return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  if (!process.env.STRIPE_SECRET_KEY) return Response.json({ error: 'Stripe not configured' }, { status: 503 });

  try {
    const { reservationId, status = 'in_progress' } = await req.json();
    if (!reservationId) return Response.json({ error: 'reservationId required' }, { status: 400 });

    const { data: r, error } = await supabaseAdmin
      .from('reservations')
      .select('id, status, payment_status, total, stripe_paid_amount, stripe_payment_intent_id')
      .eq('id', reservationId)
      .single();
    if (error || !r) return Response.json({ error: 'Reservation not found' }, { status: 404 });
    if (CLOSED_STATUSES.has(String(r.status ?? '').toLowerCase())) {
      return Response.json({ error: 'Reservation is closed' }, { status: 409 });
    }

    const paymentStatus = String(r.payment_status ?? '').toLowerCase();
    if (paymentStatus === 'paid') {
      return Response.json({
        ok: true,
        alreadyCaptured: true,
        captured: Number(r.stripe_paid_amount ?? r.total ?? 0),
        currency: 'jpy',
      });
    }
    if (paymentStatus !== AUTHORIZED_PAYMENT_STATUS || !r.stripe_payment_intent_id) {
      return Response.json({ error: 'Reservation is not authorized yet' }, { status: 409 });
    }

    const inspectionComplete = await hasCompleteDepartureInspection(r.id);
    if (!inspectionComplete) {
      return Response.json({
        error: 'Departure 10-photo inspection is required before pickup capture.',
        code: 'departure_inspection_required',
      }, { status: 409 });
    }

    const captureAmount = Math.max(0, Number(r.total ?? 0));
    if (captureAmount <= 0) {
      return Response.json({ error: 'Invalid capture amount' }, { status: 400 });
    }

    await stripe.paymentIntents.capture(
      r.stripe_payment_intent_id,
      {
        amount_to_capture: Math.round(captureAmount),
        final_capture: true,
        metadata: {
          platform: 'best-car-rental',
          reservationId: String(r.id),
          kind: 'pickup-full-capture',
        },
      },
      { idempotencyKey: stripeIdempotencyKey('capture-pickup', r.id) },
    );

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('reservations')
      .update({
        status,
        payment_status: 'paid',
        stripe_paid_amount: Math.round(captureAmount),
      })
      .eq('id', r.id)
      .select()
      .single();
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({
      ok: true,
      captured: Math.round(captureAmount),
      currency: 'jpy',
      reservation: updated,
    });
  } catch (error) {
    console.error('[reservations/capture]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
