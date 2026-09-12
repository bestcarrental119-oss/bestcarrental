/**
 * POST /api/preauth
 * 事前オーソリ（Yesaway型）。店内でオーソリを拒否された場合などに、事前に実行して
 * 「後日、事故・破損の実費を請求できる」状態をつくる。
 *   mode:'zero' → Stripe SetupIntent（¥0でカードを登録。実課金なし）
 *   mode:'one'  → ¥1 の manual-capture PaymentIntent（1円の与信確保）
 * 返り値の clientSecret をクライアントがカードElementで確定する。
 *
 * Body: { reservationId?, userId?, email?, mode:'zero'|'one' }
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

async function findOrCreateCustomer({ email, userId }) {
  if (email) {
    const found = await stripe.customers.list({ email, limit: 1 });
    if (found.data[0]) return found.data[0];
  }
  return stripe.customers.create({
    email: email || undefined,
    metadata: { platform: 'best-car-rental', userId: userId ?? '' },
  });
}

export async function POST(req) {
  try {
    const { reservationId, userId, email, mode = 'zero' } = await req.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ demo: true, mode });
    }

    const metadata = {
      platform: 'best-car-rental',
      type: 'preauth',
      reservationId: reservationId ?? '',
      userId: userId ?? '',
    };

    const customer = await findOrCreateCustomer({ email, userId });

    if (mode === 'one') {
      // ¥1 の与信確保（manual capture）。確認後はそのまま解放/取消できる。
      const pi = await stripe.paymentIntents.create({
        amount: 1, currency: 'jpy', customer: customer.id,
        capture_method: 'manual', setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true }, metadata,
      });
      return Response.json({ clientSecret: pi.client_secret, customerId: customer.id, mode: 'one', kind: 'payment' });
    }

    // ¥0 カード登録（SetupIntent）
    const si = await stripe.setupIntents.create({
      customer: customer.id, payment_method_types: ['card'],
      usage: 'off_session', metadata,
    });
    return Response.json({ setupClientSecret: si.client_secret, customerId: customer.id, mode: 'zero', kind: 'setup' });
  } catch (e) {
    console.error('[preauth]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// 予約に事前オーソリ完了を記録（クライアントが確定後に呼ぶ）
export async function PATCH(req) {
  if (!supabaseAdmin) return Response.json({ ok: true, demo: true });
  try {
    const { reservationId, customerId, paymentMethodId, mode } = await req.json();
    if (!reservationId) return Response.json({ error: 'reservationId required' }, { status: 400 });
    await supabaseAdmin.from('reservations').update({
      stripe_customer_id: customerId ?? null,
      stripe_payment_method_id: paymentMethodId ?? null,
      preauth_mode: mode ?? 'zero',
      preauth_at: new Date().toISOString(),
    }).eq('id', reservationId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
