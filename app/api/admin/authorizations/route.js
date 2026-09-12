import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isMasterUser } from '../../../../lib/master';
import {
  AUTHORIZED_PAYMENT_STATUS,
  RELEASED_PAYMENT_STATUS,
  stripeIdempotencyKey,
} from '../../../../lib/paymentAuthorization';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });
const ZERO_PREAUTH_CHARGE_MIN = 50;
const MAX_MANUAL_CHARGE = 9_999_999;

function cleanAmount(value) {
  const amount = Math.round(Number(value ?? 0));
  if (!Number.isFinite(amount) || amount < ZERO_PREAUTH_CHARGE_MIN || amount > MAX_MANUAL_CHARGE) {
    throw new Error(`amount must be between ${ZERO_PREAUTH_CHARGE_MIN} and ${MAX_MANUAL_CHARGE} JPY`);
  }
  return amount;
}

function objectOpts(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mapReservation(row, ownerMap = {}, vehicleMap = {}) {
  const opts = objectOpts(row?.opts);
  const auth = objectOpts(opts.paymentAuthorization);
  const owner = ownerMap[String(row?.owner_id)] ?? null;
  const vehicle = vehicleMap[String(row?.vehicle_id)] ?? null;
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    total: Number(row.total ?? 0),
    stripePaidAmount: row.stripe_paid_amount,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeCustomerId: row.stripe_customer_id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    preauthMode: row.preauth_mode,
    preauthAt: row.preauth_at,
    pickup: row.pickup_at,
    ret: row.return_at,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    ownerId: row.owner_id,
    storeName: owner?.store_name ?? row.owner_id ?? '未紐付け店舗',
    vehicleName: vehicle ? `${vehicle.maker ?? ''} ${vehicle.model ?? ''}`.trim() : (row.vehicle_id ?? '未割当'),
    amountCapturable: Number(auth.amountCapturable ?? 0),
    captureBefore: auth.captureBefore ?? null,
    masterAuthorization: objectOpts(opts.masterAuthorization),
  };
}

function isAuthorizationCandidate(row) {
  const status = String(row?.payment_status ?? '').toLowerCase();
  const settled = status === 'paid' || status === RELEASED_PAYMENT_STATUS;
  return status === AUTHORIZED_PAYMENT_STATUS
    || status === 'scheduled'
    || status === 'release_required'
    || (!settled && Boolean(row?.stripe_payment_intent_id))
    || (!settled && Boolean(row?.preauth_at && row?.stripe_customer_id && row?.stripe_payment_method_id));
}

function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

async function assertMaster(req, requesterId) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'master session required' };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'invalid master session' };
  if (requesterId && data.user.id !== requesterId) {
    return { ok: false, status: 403, error: 'requester mismatch' };
  }
  if (!isMasterUser(data.user)) return { ok: false, status: 403, error: 'master only' };
  return { ok: true };
}

async function lookupMaps(rows) {
  const ownerIds = [...new Set((rows ?? []).map(row => row.owner_id).filter(Boolean).map(String))];
  const vehicleIds = [...new Set((rows ?? []).map(row => row.vehicle_id).filter(Boolean).map(String))];
  const [ownersRes, vehiclesRes] = await Promise.all([
    ownerIds.length
      ? supabaseAdmin.from('owners').select('id, store_name').in('id', ownerIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length
      ? supabaseAdmin.from('vehicles').select('id, maker, model').in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    owners: Object.fromEntries((ownersRes.data ?? []).map(owner => [String(owner.id), owner])),
    vehicles: Object.fromEntries((vehiclesRes.data ?? []).map(vehicle => [String(vehicle.id), vehicle])),
  };
}

async function loadReservation(reservationId) {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (error || !data) throw new Error('Reservation not found');
  return data;
}

async function updateReservation(row, patch) {
  const opts = objectOpts(row.opts);
  const { masterAuthorization, ...columns } = patch;
  const nextOpts = {
    ...opts,
    masterAuthorization: {
      ...objectOpts(opts.masterAuthorization),
      ...masterAuthorization,
      at: new Date().toISOString(),
    },
  };
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({ ...columns, opts: nextOpts })
    .eq('id', row.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const requesterId = searchParams.get('requesterId');
  const guard = await assertMaster(req, requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []).filter(isAuthorizationCandidate).slice(0, 80);
  const maps = await lookupMaps(candidates);
  return NextResponse.json({
    reservations: candidates.map(row => mapReservation(row, maps.owners, maps.vehicles)),
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { requesterId, reservationId, action } = body || {};
  if (!reservationId) return NextResponse.json({ error: 'reservationId required' }, { status: 400 });

  const guard = await assertMaster(req, requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const row = await loadReservation(reservationId);

    if (action === 'release') {
      const paymentStatus = String(row.payment_status ?? '').toLowerCase();
      if (![AUTHORIZED_PAYMENT_STATUS, 'release_required'].includes(paymentStatus)) {
        return NextResponse.json({ error: 'Only active authorization holds can be released' }, { status: 409 });
      }
      if (!row.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No authorization hold to release' }, { status: 409 });
      }
      await stripe.paymentIntents.cancel(
        row.stripe_payment_intent_id,
        { cancellation_reason: 'requested_by_customer' },
        { idempotencyKey: stripeIdempotencyKey('master-release', row.id) },
      );
      const updated = await updateReservation(row, {
        payment_status: RELEASED_PAYMENT_STATUS,
        stripe_paid_amount: 0,
        masterAuthorization: { action: 'release', amount: 0, paymentIntentId: row.stripe_payment_intent_id },
      });
      return NextResponse.json({ ok: true, action, reservation: mapReservation(updated) });
    }

    const amount = cleanAmount(body.amount);

    if (action === 'capture') {
      if (!row.stripe_payment_intent_id) {
        return NextResponse.json({ error: 'No authorization hold to capture' }, { status: 409 });
      }
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      const capturable = Number(pi.amount_capturable ?? 0);
      if (capturable <= 0) return NextResponse.json({ error: 'No capturable amount remains' }, { status: 409 });
      if (amount > capturable) {
        return NextResponse.json({ error: `amount exceeds capturable balance: ${capturable}` }, { status: 400 });
      }
      await stripe.paymentIntents.capture(
        row.stripe_payment_intent_id,
        {
          amount_to_capture: Math.round(amount),
          final_capture: true,
          metadata: {
            platform: 'best-car-rental',
            reservationId: String(row.id),
            kind: 'master-manual-capture',
          },
        },
        { idempotencyKey: stripeIdempotencyKey(`master-capture-${amount}`, row.id) },
      );
      const updated = await updateReservation(row, {
        payment_status: 'paid',
        stripe_paid_amount: Math.round(amount),
        masterAuthorization: { action: 'capture', amount, paymentIntentId: row.stripe_payment_intent_id },
      });
      return NextResponse.json({ ok: true, action, captured: amount, reservation: mapReservation(updated) });
    }

    if (action === 'charge') {
      if (!row.stripe_customer_id || !row.stripe_payment_method_id) {
        return NextResponse.json({ error: 'No saved zero-yen authorization card on this reservation' }, { status: 409 });
      }
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'jpy',
          customer: row.stripe_customer_id,
          payment_method: row.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            platform: 'best-car-rental',
            reservationId: String(row.id),
            kind: 'master-zero-preauth-charge',
          },
        },
        { idempotencyKey: stripeIdempotencyKey(`master-zero-charge-${amount}`, row.id) },
      );
      if (!['succeeded', 'processing'].includes(pi.status)) {
        throw new Error(`PaymentIntent status: ${pi.status}`);
      }
      const updated = await updateReservation(row, {
        payment_status: 'paid',
        stripe_payment_intent_id: pi.id,
        stripe_paid_amount: amount,
        masterAuthorization: { action: 'charge', amount, paymentIntentId: pi.id },
      });
      return NextResponse.json({ ok: true, action, charged: amount, reservation: mapReservation(updated) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[admin/authorizations]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
