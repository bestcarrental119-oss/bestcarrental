/**
 * POST /api/payments
 * Creates (or confirms) a Stripe PaymentIntent for a reservation.
 *
 * Body (new card):
 *   { amount, reservationId, userId, vehicleId, email?, saveCard?:bool }
 *   → { clientSecret, customerId? }   (client confirms with Card Element)
 *
 * Body (saved card, off-session):
 *   { amount, reservationId, useSaved:true, customerId, paymentMethodId }
 *   → { status:'succeeded', paymentIntentId }
 *     or { requiresAction:true, clientSecret } if 3DS is needed.
 *
 * When saveCard is true a Stripe Customer is created/reused and
 * setup_future_usage='off_session' stores the card for next time.
 */
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10',
});

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
    const body = await req.json();
    const {
      mode = 'payment',
      amount, reservationId, userId, vehicleId, email,
      saveCard = false, useSaved = false, customerId, paymentMethodId,
    } = body;

    // `mode: 'setup'` only saves the card (no charge, no processing fee).
    // The card is charged later by the /api/cron/charge-due job.
    const isSetup = mode === 'setup';

    if (!isSetup && (!amount || amount < 50)) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      // Demo mode — no real charge so the booking flow still completes.
      return Response.json({ demo: true, status: 'succeeded' });
    }

    const metadata = {
      platform: 'best-car-rental',
      reservationId: reservationId ?? '',
      userId: userId ?? '',
      vehicleId: vehicleId ?? '',
    };

    // ── Setup only: save the card for a later off-session charge ──
    if (isSetup) {
      const customer = await findOrCreateCustomer({ email, userId });
      const si = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata,
      });
      return Response.json({ setupClientSecret: si.client_secret, customerId: customer.id });
    }

    // ── Saved card: confirm off-session ──────────────────────────
    if (useSaved && customerId && paymentMethodId) {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(amount), currency: 'jpy',
        customer: customerId, payment_method: paymentMethodId,
        off_session: true, confirm: true, metadata,
      });
      if (pi.status === 'succeeded') {
        return Response.json({ status: 'succeeded', paymentIntentId: pi.id });
      }
      return Response.json({ requiresAction: true, clientSecret: pi.client_secret });
    }

    // ── New card ─────────────────────────────────────────────────
    // 後日の損害請求に備え、常にカードを顧客に紐づけて保存（card-on-file）。
    const customer = await findOrCreateCustomer({ email, userId });

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount), currency: 'jpy',
      automatic_payment_methods: { enabled: true },
      customer: customer.id,
      setup_future_usage: 'off_session',
      metadata,
    });

    return Response.json({
      clientSecret: pi.client_secret,
      customerId: customer.id,
    });
  } catch (err) {
    console.error('[POST /api/payments] Stripe error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
