/**
 * PATCH /api/owner/reservations/:id/decision
 * Body: { ownerId, action: 'approve' | 'reject', reason? }
 *
 * Lets an owner decide whether to lend for a reservation after reviewing the
 * renter's profile. The endpoint verifies that the reservation belongs to the
 * owner before changing the status.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import {
  AUTHORIZED_PAYMENT_STATUS,
  RELEASED_PAYMENT_STATUS,
  stripeIdempotencyKey,
} from '../../../../../../lib/paymentAuthorization';

export const dynamic = 'force-dynamic';

const DECIDABLE_STATUSES = new Set(['pending', 'confirmed', 'pending_assignment']);

async function resolveOwnerLookupIds(ownerId) {
  if (!ownerId) return [];
  const [byId, byUser] = await Promise.all([
    supabaseAdmin.from('owners').select('id, user_id').eq('id', ownerId),
    supabaseAdmin.from('owners').select('id, user_id').eq('user_id', ownerId),
  ]);
  return [...new Set([ownerId, ...(byId.data ?? []), ...(byUser.data ?? [])]
    .flatMap(owner => typeof owner === 'string' ? owner : [owner.id, owner.user_id])
    .filter(Boolean)
    .map(String))];
}

async function assertOwnerCanDecide(reservation, ownerLookupIds) {
  const reservationOwnerId = reservation.owner_id ? String(reservation.owner_id) : null;
  if (reservationOwnerId && ownerLookupIds.includes(reservationOwnerId)) return null;

  if (!reservation.vehicle_id) {
    return NextResponse.json({ error: 'Reservation owner mismatch' }, { status: 403 });
  }

  const { data: vehicle, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, owner_id, owner_auth_id')
    .eq('id', reservation.vehicle_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vehicleOwnerIds = [vehicle?.owner_id, vehicle?.owner_auth_id].filter(Boolean).map(String);
  if (!vehicleOwnerIds.some(ownerId => ownerLookupIds.includes(ownerId))) {
    return NextResponse.json({ error: 'Vehicle owner mismatch' }, { status: 403 });
  }
  return null;
}

async function refundPaidReservationIfNeeded(reservation) {
  const paymentStatus = String(reservation.payment_status ?? '').toLowerCase();
  if (paymentStatus === 'scheduled') return 'none';
  if (paymentStatus === AUTHORIZED_PAYMENT_STATUS) {
    if (!reservation.stripe_payment_intent_id || !process.env.STRIPE_SECRET_KEY) return 'release_required';
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
      await stripe.paymentIntents.cancel(
        reservation.stripe_payment_intent_id,
        { cancellation_reason: 'requested_by_customer' },
        { idempotencyKey: stripeIdempotencyKey('owner-reject-release', reservation.id) },
      );
      return RELEASED_PAYMENT_STATUS;
    } catch (error) {
      console.warn('[owner reservation decision] authorization release failed:', error.message);
      return 'release_required';
    }
  }
  if (paymentStatus !== 'paid') return reservation.payment_status ?? 'none';
  if (!reservation.stripe_payment_intent_id || !process.env.STRIPE_SECRET_KEY) return 'refund_required';

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const paidAmount = Number(reservation.stripe_paid_amount ?? reservation.total ?? 0);
    await stripe.refunds.create(
      {
        payment_intent: reservation.stripe_payment_intent_id,
        amount: Math.max(0, Math.round(paidAmount)),
        metadata: {
          platform: 'best-car-rental',
          reservationId: String(reservation.id),
          reason: 'owner_rejected',
        },
      },
      { idempotencyKey: stripeIdempotencyKey('owner-reject-refund', reservation.id) },
    );
    return 'refunded';
  } catch (error) {
    console.warn('[owner reservation decision] refund failed:', error.message);
    return 'refund_required';
  }
}

export async function PATCH(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const reservationId = params?.id;
  const { ownerId, action, reason } = await req.json();
  if (!reservationId || !ownerId || !action) {
    return NextResponse.json({ error: 'reservation id, ownerId, and action required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const ownerLookupIds = await resolveOwnerLookupIds(ownerId);
  if (!ownerLookupIds.length) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });

  const { data: reservation, error } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

  const ownershipError = await assertOwnerCanDecide(reservation, ownerLookupIds);
  if (ownershipError) return ownershipError;

  const currentStatus = String(reservation.status ?? '').toLowerCase();
  if (!DECIDABLE_STATUSES.has(currentStatus)) {
    return NextResponse.json({ error: 'Reservation cannot be decided in its current status' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const opts = {
    ...(reservation.opts ?? {}),
    ownerDecision: {
      action,
      reason: reason ? String(reason).slice(0, 500) : null,
      decidedAt: now,
      decidedBy: ownerId,
    },
  };

  let updates;
  if (action === 'approve') {
    updates = { status: 'confirmed', opts };
  }
  if (action === 'reject') {
    updates = {
      status: 'rejected',
      payment_status: await refundPaidReservationIfNeeded(reservation),
      opts,
    };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('reservations')
    .update(updates)
    .eq('id', reservationId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ reservation: updated });
}
