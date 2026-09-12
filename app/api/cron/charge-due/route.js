/**
 * GET /api/cron/charge-due
 *
 * Cron job: authorize reservations whose free-cancellation window has closed.
 * At booking we only SAVE the card (Stripe SetupIntent, no fee). Authorization
 * is deferred to (pickup - 7 days) and stored in `charge_at`. This job runs
 * hourly, finds reservations with payment_status='scheduled' and charge_at in
 * the past, then creates a manual-capture PaymentIntent.
 *
 * Result: cancellations made before charge_at cost nothing. Cancellations after
 * authorization capture only the policy fee and release the remaining hold.
 *
 * Schedule: Vercel Cron "0 * * * *" (hourly). Protected by CRON_SECRET header.
 */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';
import { sendEmail } from '../../../../lib/email';
import {
  AUTHORIZED_PAYMENT_STATUS,
  buildReservationAuthorizationIntentParams,
  extractAuthorizationDetails,
  stripeIdempotencyKey,
} from '../../../../lib/paymentAuthorization';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

function objectOpts(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function notifyAuthorizationFailure(reservation, message) {
  const to = reservation.guest_email;
  if (!to) return;
  const reservationId = escapeHtml(reservation.id);
  const reason = escapeHtml(String(message ?? 'authorization failed').slice(0, 180));
  await sendEmail({
    to,
    subject: 'BEST Car Rental payment authorization failed',
    html: `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px;color:#111827">カードの事前承認に失敗しました</h2>
        <p style="line-height:1.7;color:#374151">予約 ${reservationId} の出発7日前の事前オーソリを完了できませんでした。別のカードを登録してください。</p>
        <p style="line-height:1.7;color:#6b7280">理由: ${reason}</p>
      </div>
    `,
  }).catch(error => {
    console.warn('[charge-due] auth failure email failed:', error.message);
  });
}

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const now = new Date().toISOString();

  // Reservations whose scheduled authorization is due and not yet cancelled.
  const { data: due, error } = await supabaseAdmin
    .from('reservations')
    .select('id, total, stripe_customer_id, stripe_payment_method_id, charge_attempts, status, opts, guest_email, guest_name')
    .eq('payment_status', 'scheduled')
    .lte('charge_at', now)
    .not('status', 'in', '("cancelled","canceled","rejected")');

  if (error) {
    console.error('[charge-due] fetch error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ authorized: 0, message: 'No reservations due' });
  }

  let authorized = 0;
  let failed = 0;

  for (const r of due) {
    if (!r.stripe_customer_id || !r.stripe_payment_method_id || !r.total) {
      await supabaseAdmin.from('reservations')
        .update({ payment_status: 'failed', charge_attempts: (r.charge_attempts ?? 0) + 1 })
        .eq('id', r.id);
      await notifyAuthorizationFailure(r, 'missing saved payment method');
      failed++;
      continue;
    }
    try {
      const pi = await stripe.paymentIntents.create(
        buildReservationAuthorizationIntentParams({
          amount: r.total,
          customerId: r.stripe_customer_id,
          paymentMethodId: r.stripe_payment_method_id,
          reservationId: r.id,
        }),
        { idempotencyKey: stripeIdempotencyKey('authorize', r.id) },
      );

      if (pi.status === 'requires_capture') {
        const auth = extractAuthorizationDetails(pi);
        const opts = objectOpts(r.opts);
        await supabaseAdmin.from('reservations')
          .update({
            payment_status: AUTHORIZED_PAYMENT_STATUS,
            stripe_payment_intent_id: pi.id,
            stripe_paid_amount: 0,
            charge_attempts: (r.charge_attempts ?? 0) + 1,
            opts: {
              ...opts,
              paymentAuthorization: {
                ...(opts.paymentAuthorization ?? {}),
                paymentIntentId: pi.id,
                authorizedAt: new Date().toISOString(),
                captureBefore: auth.captureBefore,
                extendedStatus: auth.extendedStatus,
                amountCapturable: auth.amountCapturable,
              },
            },
          })
          .eq('id', r.id);
        authorized++;
      } else {
        // requires_action / requires_payment_method etc. — needs customer attention
        await supabaseAdmin.from('reservations')
          .update({ payment_status: 'failed', charge_attempts: (r.charge_attempts ?? 0) + 1 })
          .eq('id', r.id);
        await notifyAuthorizationFailure(r, `PaymentIntent status: ${pi.status}`);
        failed++;
      }
    } catch (e) {
      console.error(`[charge-due] authorization failed for ${r.id}:`, e.message);
      await supabaseAdmin.from('reservations')
        .update({ payment_status: 'failed', charge_attempts: (r.charge_attempts ?? 0) + 1 })
        .eq('id', r.id);
      await notifyAuthorizationFailure(r, e.message);
      failed++;
    }
  }

  return NextResponse.json({ authorized, failed, total: due.length });
}
