/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session (Stripe-hosted payment page) so Apple Pay /
 * Google Pay work on ANY device without registering the domain — the payment
 * happens on checkout.stripe.com, which is already wallet-verified.
 *
 * The reservation must already exist (status 'payment_pending'). On success the
 * existing webhook (payment_intent.succeeded, matched by metadata.reservationId)
 * flips it to 'confirmed'.
 *
 * Body: { amount, reservationId, userId?, vehicleId?, email?, vehicleName?, locale?, wallet? }
 * Returns: { url } | { demo: true } | { error }
 */
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

// App locale → Stripe Checkout locale
const STRIPE_LOCALE = {
  en: 'en', ja: 'ja', ko: 'ko',
  'zh-CN': 'zh', 'zh-TW': 'zh-TW',
};

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      amount, reservationId, userId, vehicleId, email,
      vehicleName, locale, wallet, defer,
    } = body;

    const amt = Math.round(Number(amount) || 0);
    if (!amt || amt < 50) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Demo mode — no Stripe key configured; let the client complete the booking.
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ demo: true });
    }

    // Absolute return URLs (needed by Stripe). Prefer the request origin.
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://best-car-rental.vercel.app';

    const metadata = {
      platform: 'best-car-rental',
      reservationId: reservationId ?? '',
      userId: userId ?? '',
      vehicleId: vehicleId ?? '',
      wallet: wallet ?? '',
    };

    const successUrl = `${origin}/?checkout=success&res=${encodeURIComponent(reservationId ?? '')}&cs={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?checkout=cancel&res=${encodeURIComponent(reservationId ?? '')}`;

    let session;
    if (defer) {
      // 受取7日以上先：今は課金せず、ウォレットのカードを保存するだけ（mode:'setup'）。
      // /api/checkout/confirm が戻り時に保管し、cron が受取7日前に off_session 課金。
      session = await stripe.checkout.sessions.create({
        mode: 'setup',
        payment_method_types: ['card'],
        locale: STRIPE_LOCALE[locale] ?? 'auto',
        customer_email: email || undefined,
        customer_creation: 'always',
        setup_intent_data: { metadata },
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        // 'card' also surfaces Apple Pay / Google Pay automatically on Checkout.
        payment_method_types: ['card'],
        locale: STRIPE_LOCALE[locale] ?? 'auto',
        customer_email: email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'jpy',
              unit_amount: amt,
              product_data: {
                name: vehicleName || 'BEST Car Rental',
                description: reservationId ? `Reservation ${reservationId}` : undefined,
              },
            },
          },
        ],
        metadata,
        // 顧客を必ず作成し、カードを保存（後日の損害請求用 card-on-file）。
        customer_creation: 'always',
        // Ensures the webhook (payment_intent.succeeded) can finalize the reservation.
        payment_intent_data: { metadata, setup_future_usage: 'off_session' },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    return Response.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('[POST /api/checkout] Stripe error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
