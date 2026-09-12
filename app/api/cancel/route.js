/**
 * POST /api/cancel
 * Cancel a reservation and settle the Stripe amount that follows the platform
 * cancellation policy (lib/paymentAuthorization.js -> calcCancelFeeForTime):
 *
 *   >= 7 days before pickup       : free
 *   6-2 days                      : 30% fee
 *   1 day                         : 50% fee
 *   same day, before pickup time  : 80% fee
 *   after pickup time / no-show   : 100% fee
 *
 * Behaviour by payment state:
 *   payment_status = 'scheduled'  -> card saved but not authorized yet.
 *   payment_status = 'authorized' -> capture only the fee from the hold.
 *   payment_status = 'paid'       -> refund paid minus fee for legacy/immediate payments.
 *
 * Body: { reservationId }
 * Returns: { ok, status, cancelFee, refundAmount, refundId?, charged, released, currency }
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../lib/supabase';
import {
  AUTHORIZED_PAYMENT_STATUS,
  CANCEL_FEE_CAPTURED_PAYMENT_STATUS,
  RELEASED_PAYMENT_STATUS,
  buildReservationAuthorizationIntentParams,
  calcCancelFeeForTime,
  stripeIdempotencyKey,
} from '../../../lib/paymentAuthorization';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

const CLOSED_STATUSES = new Set(['cancelled', 'canceled', 'rejected']);

function isAuthorized(status) {
  return String(status ?? '').toLowerCase() === AUTHORIZED_PAYMENT_STATUS;
}

async function ensureAuthorizationForLateScheduledCancel(reservation, cancelFee) {
  if (
    cancelFee <= 0
    || reservation.stripe_payment_intent_id
    || !reservation.stripe_customer_id
    || !reservation.stripe_payment_method_id
    || !process.env.STRIPE_SECRET_KEY
  ) {
    return reservation.stripe_payment_intent_id ?? null;
  }

  const pi = await stripe.paymentIntents.create(
    buildReservationAuthorizationIntentParams({
      amount: reservation.total,
      customerId: reservation.stripe_customer_id,
      paymentMethodId: reservation.stripe_payment_method_id,
      reservationId: reservation.id,
    }),
    { idempotencyKey: stripeIdempotencyKey('authorize-for-cancel', reservation.id) },
  );
  if (pi.status !== 'requires_capture') {
    throw new Error(`Authorization failed before cancellation capture: ${pi.status}`);
  }
  return pi.id;
}

export async function POST(req) {
  try {
    const { reservationId } = await req.json();
    if (!reservationId) {
      return Response.json({ error: 'reservationId is required' }, { status: 400 });
    }

    // ── Demo / no-backend mode: compute policy numbers only ────────
    if (!supabaseAdmin) {
      return Response.json({
        ok: true, demo: true, status: 'cancelled',
        cancelFee: null, refundAmount: null, charged: false, paymentStatus: 'none', currency: 'jpy',
      });
    }

    // ── Load the reservation ───────────────────────────────────────
    const { data: r, error } = await supabaseAdmin
      .from('reservations')
      .select('id, status, payment_status, total, stripe_paid_amount, stripe_payment_intent_id, stripe_customer_id, stripe_payment_method_id, pickup_at')
      .eq('id', reservationId)
      .single();

    if (error || !r) {
      return Response.json({ error: 'Reservation not found' }, { status: 404 });
    }
    if (CLOSED_STATUSES.has(String(r.status ?? '').toLowerCase())) {
      return Response.json({ ok: true, status: 'cancelled', alreadyCancelled: true, currency: 'jpy' });
    }

    const totalAmount = Number(r.total ?? r.stripe_paid_amount ?? 0);
    const paidAmount = Number(r.stripe_paid_amount ?? 0);
    const paymentStatus = String(r.payment_status ?? '').toLowerCase();
    const cancelFee = calcCancelFeeForTime(totalAmount, r.pickup_at, new Date());

    // Not charged yet and still inside the free window.
    if ((paymentStatus === 'scheduled' || !r.stripe_payment_intent_id) && cancelFee <= 0) {
      await supabaseAdmin.from('reservations')
        .update({ status: 'cancelled', payment_status: 'none', cancel_fee: 0, refund_amount: 0 })
        .eq('id', r.id);
      return Response.json({
        ok: true, status: 'cancelled', cancelFee: 0, refundAmount: 0,
        charged: false, released: false, paymentStatus: 'none', currency: 'jpy',
      });
    }

    let paymentIntentId = r.stripe_payment_intent_id;
    if (paymentStatus === 'scheduled' && cancelFee > 0 && !paymentIntentId) {
      paymentIntentId = await ensureAuthorizationForLateScheduledCancel(r, cancelFee);
    }

    // Authorized only: capture the policy fee and release the rest.
    if (isAuthorized(paymentStatus) || (paymentStatus === 'scheduled' && cancelFee > 0 && paymentIntentId)) {
      if (!paymentIntentId) {
        await supabaseAdmin.from('reservations')
          .update({
            status: 'cancelled',
            payment_status: 'cancel_fee_pending',
            cancel_fee: cancelFee,
            refund_amount: 0,
          })
          .eq('id', r.id);
        return Response.json({
          ok: false,
          status: 'cancelled',
          cancelFee,
          refundAmount: 0,
          charged: false,
          released: false,
          paymentStatus: 'cancel_fee_pending',
          requiresManualCollection: true,
          currency: 'jpy',
        }, { status: 409 });
      }

      if (cancelFee <= 0) {
        if (process.env.STRIPE_SECRET_KEY) {
          await stripe.paymentIntents.cancel(
            paymentIntentId,
            { cancellation_reason: 'requested_by_customer' },
            { idempotencyKey: stripeIdempotencyKey('cancel-auth', r.id) },
          ).catch(() => {});
        }
        await supabaseAdmin.from('reservations')
          .update({ status: 'cancelled', payment_status: RELEASED_PAYMENT_STATUS, cancel_fee: 0, refund_amount: 0 })
          .eq('id', r.id);
        return Response.json({
          ok: true,
          status: 'cancelled',
          cancelFee: 0,
          refundAmount: 0,
          charged: false,
          released: true,
          paymentStatus: RELEASED_PAYMENT_STATUS,
          currency: 'jpy',
        });
      }

      if (process.env.STRIPE_SECRET_KEY) {
        await stripe.paymentIntents.capture(
          paymentIntentId,
          {
            amount_to_capture: Math.round(cancelFee),
            final_capture: true,
            metadata: {
              platform: 'best-car-rental',
              reservationId: String(r.id),
              cancelFee: String(cancelFee),
              policy: 'calcCancelFeeForTime',
            },
          },
          { idempotencyKey: stripeIdempotencyKey('capture-cancel-fee', r.id) },
        );
      }

      await supabaseAdmin.from('reservations')
        .update({
          status: 'cancelled',
          payment_status: CANCEL_FEE_CAPTURED_PAYMENT_STATUS,
          cancel_fee: cancelFee,
          refund_amount: 0,
          stripe_paid_amount: cancelFee,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq('id', r.id);

      return Response.json({
        ok: true,
        status: 'cancelled',
        cancelFee,
        refundAmount: 0,
        charged: true,
        released: true,
        paymentStatus: CANCEL_FEE_CAPTURED_PAYMENT_STATUS,
        currency: 'jpy',
      });
    }

    // Already paid: issue the policy-based partial refund.
    const refundAmount = Math.max(0, paidAmount - cancelFee);
    let refundId = null;
    if (process.env.STRIPE_SECRET_KEY && refundAmount > 0) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: r.stripe_payment_intent_id,
          amount: Math.round(refundAmount),
          metadata: {
            platform: 'best-car-rental',
            reservationId: String(r.id),
            cancelFee: String(cancelFee),
            policy: 'calcCancelFeeForTime',
          },
        },
        { idempotencyKey: stripeIdempotencyKey('refund-cancel', r.id) },
      );
      refundId = refund.id;
    }

    await supabaseAdmin.from('reservations')
      .update({
        status: 'cancelled',
        payment_status: refundAmount > 0 ? 'refunded' : 'paid',
        cancel_fee: cancelFee,
        refund_amount: refundAmount,
        stripe_refund_id: refundId,
      })
      .eq('id', r.id);

    return Response.json({
      ok: true, status: 'cancelled',
      cancelFee, refundAmount, refundId,
      charged: true,
      released: false,
      paymentStatus: refundAmount > 0 ? 'refunded' : 'paid',
      currency: 'jpy',
    });
  } catch (err) {
    console.error('[POST /api/cancel] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
