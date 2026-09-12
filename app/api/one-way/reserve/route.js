/**
 * POST /api/one-way/reserve
 * Creates a Stripe PRE-AUTHORIZATION (capture_method: 'manual') — a hold on the
 * card, NOT an immediate charge. The hold = base + insurance + deposit(50,000).
 * On a proper return we later capture only base + insurance (see /capture),
 * releasing the deposit.
 *
 * Body: { listingId, userId?, email?, insurancePlanId, insuranceAmount, pickupAt?, returnAt? }
 * Returns: { clientSecret, reservationId, holdTotal, captureTotal, depositAmount } | { demo }
 */
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';
import { calcAuthorization, listingReadyForReservation, ONE_WAY_DEPOSIT, rentalDaysBetween } from '../../../../lib/oneWay';

export const dynamic = 'force-dynamic';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

async function findOrCreateCustomer({ email, userId }) {
  if (email) {
    const found = await stripe.customers.list({ email, limit: 1 });
    if (found.data[0]) return found.data[0];
  }
  return stripe.customers.create({ email: email || undefined, metadata: { platform: 'best-car-rental', userId: userId ?? '' } });
}

function makeReservationId() {
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `OW-${new Date().getFullYear()}-${raw.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

export async function POST(req) {
  if (!supabaseAdmin) return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const { listingId, userId, email, insurancePlanId, insuranceAmount, pickupAt, returnAt } = await req.json();
    if (!listingId) return Response.json({ error: 'listingId required' }, { status: 400 });

    // Load listing and make sure it is still open.
    const { data: listing, error: lErr } = await supabaseAdmin
      .from('one_way_listings').select('*').eq('id', listingId).single();
    if (lErr || !listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
    if (listing.status !== 'open') return Response.json({ error: 'Listing is no longer available' }, { status: 409 });
    if (!listingReadyForReservation(listing)) return Response.json({ error: 'Listing is not ready for pickup' }, { status: 409 });

    const rentalDays = rentalDaysBetween(
      pickupAt ?? listing.available_from,
      returnAt ?? listing.deadline_at,
    );
    const baseAmount = Math.max(0, Math.round(Number(listing.base_price) || 0)) * rentalDays;
    const auth = calcAuthorization({
      base: baseAmount,
      insurance: insuranceAmount,
      deposit: ONE_WAY_DEPOSIT,
    });

    const reservationId = makeReservationId();
    const metadata = {
      platform: 'best-car-rental',
      type: 'one_way',
      listingId: String(listingId),
      reservationId,
      captureTotal: String(auth.captureTotal),
      deposit: String(auth.deposit),
    };

    // Persist the reservation up-front (payment_pending).
    await supabaseAdmin.from('reservations').insert({
      id: reservationId,
      vehicle_id: listing.vehicle_id ?? null,
      owner_id: listing.service_owner_id ?? listing.owner_id ?? null,
      user_id: userId ?? null,
      total: auth.captureTotal,          // 通常引き落とし額（デポジットは含めない）
      status: 'payment_pending',
      type: 'one_way',
      days: rentalDays,
      pickup_at: pickupAt ?? listing.available_from ?? null,
      return_at: returnAt ?? listing.deadline_at ?? null,
      pickup_loc: listing.from_name,
      return_loc: listing.to_name,
      payment_status: 'pending',
      opts: {
        listingId,
        pickupAt: pickupAt ?? null,
        returnAt: returnAt ?? null,
        insurancePlan: insurancePlanId ?? 'basic',
        basePrice: auth.base,
        baseDailyPrice: Number(listing.base_price ?? 0),
        rentalDays,
        insuranceAmount: auth.insurance,
        deposit: auth.deposit,
        holdTotal: auth.holdTotal,
      },
    });

    // Demo mode — no Stripe key: let the client complete the flow.
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({
        demo: true, reservationId,
        holdTotal: auth.holdTotal, captureTotal: auth.captureTotal, depositAmount: auth.deposit,
      });
    }

    // Pre-authorization: capture_method 'manual' places a HOLD, not a charge.
    // 顧客を紐づけ、カードを保存（後日の損害請求用 card-on-file）。
    const customer = await findOrCreateCustomer({ email, userId });
    const pi = await stripe.paymentIntents.create({
      amount: auth.holdTotal,
      currency: 'jpy',
      capture_method: 'manual',
      customer: customer.id,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      receipt_email: email || undefined,
      metadata,
    });

    await supabaseAdmin.from('reservations')
      .update({ stripe_payment_intent_id: pi.id })
      .eq('id', reservationId);

    return Response.json({
      clientSecret: pi.client_secret,
      reservationId,
      holdTotal: auth.holdTotal,
      captureTotal: auth.captureTotal,
      depositAmount: auth.deposit,
    });
  } catch (e) {
    console.error('[one-way/reserve]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
