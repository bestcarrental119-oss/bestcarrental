/**
 * Reviews API — double-blind review system.
 *
 * GET  /api/reviews?reservationId=xxx — reviews for one reservation
 * GET  /api/reviews?userId=xxx        — renter profile reviews from hosts
 * GET  /api/reviews?ownerId=xxx       — owner/store profile reviews from customers
 * POST /api/reviews                   — submit one review
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

function compactReview(review) {
  return {
    id: review.id,
    reservationId: review.reservation_id,
    reviewerRole: review.reviewer_role,
    rating: review.rating,
    comment: review.comment,
    isAuto: review.is_auto,
    createdAt: review.created_at,
  };
}

function revealDeadlinePassed(review, now = new Date()) {
  const deadline = review.reservations?.review_deadline
    ? new Date(review.reservations.review_deadline)
    : null;
  return Boolean(deadline && now > deadline);
}

async function reviewRolesByReservation(reservationIds) {
  if (!reservationIds.length) return new Map();
  const { data } = await supabaseAdmin
    .from('reviews')
    .select('reservation_id, reviewer_role')
    .in('reservation_id', reservationIds);

  const roles = new Map();
  for (const row of data ?? []) {
    const key = String(row.reservation_id);
    const set = roles.get(key) ?? new Set();
    set.add(row.reviewer_role);
    roles.set(key, set);
  }
  return roles;
}

function isVisibleReview(review, rolesByReservation, now = new Date()) {
  const roles = rolesByReservation.get(String(review.reservation_id)) ?? new Set();
  const bothReviewed = roles.has('customer') && roles.has('host');
  return bothReviewed || revealDeadlinePassed(review, now);
}

async function visibleReviews(reviews) {
  const reservationIds = [...new Set((reviews ?? []).map(r => r.reservation_id).filter(Boolean))];
  const rolesByReservation = await reviewRolesByReservation(reservationIds);
  const now = new Date();
  return (reviews ?? []).filter(review => isVisibleReview(review, rolesByReservation, now));
}

function buildReviewProfile(reviews, subjectType) {
  const visible = (reviews ?? []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const reviewCount = visible.length;
  const avgRating = reviewCount
    ? visible.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / reviewCount
    : null;
  const lowRatingCount = visible.filter(review => Number(review.rating ?? 0) <= 2).length;
  return {
    subjectType,
    avgRating,
    reviewCount,
    ratingPoints: avgRating == null ? null : Math.round(avgRating * 20),
    lowRatingCount,
    visibleReviews: visible.map(compactReview),
    reviews: visible.map(compactReview),
  };
}

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

async function reservationIdsForOwner(ownerId) {
  const ownerLookupIds = await resolveOwnerLookupIds(ownerId);
  if (!ownerLookupIds.length) return [];

  const [byOwner, vehiclesByOwner, vehiclesByAuth] = await Promise.all([
    supabaseAdmin.from('reservations').select('id').in('owner_id', ownerLookupIds),
    supabaseAdmin.from('vehicles').select('id').in('owner_id', ownerLookupIds),
    supabaseAdmin.from('vehicles').select('id').in('owner_auth_id', ownerLookupIds),
  ]);

  const vehicleIds = [
    ...(vehiclesByOwner.data ?? []),
    ...(vehiclesByAuth.data ?? []),
  ].map(vehicle => vehicle.id).filter(Boolean);

  const byVehicle = vehicleIds.length
    ? await supabaseAdmin.from('reservations').select('id').in('vehicle_id', vehicleIds)
    : { data: [] };

  return [...new Set([...(byOwner.data ?? []), ...(byVehicle.data ?? [])].map(row => row.id).filter(Boolean))];
}

async function resolveReviewNotificationActors(reservationId) {
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, owner_id, vehicle_id')
    .eq('id', reservationId)
    .maybeSingle();
  if (!reservation) return null;

  const { data: vehicle } = reservation.vehicle_id
    ? await supabaseAdmin
      .from('vehicles')
      .select('id, maker, model, owner_id, owner_auth_id')
      .eq('id', reservation.vehicle_id)
      .maybeSingle()
    : { data: null };

  const ownerCandidates = [reservation.owner_id, vehicle?.owner_id, vehicle?.owner_auth_id].filter(Boolean);
  const { data: owners } = ownerCandidates.length
    ? await supabaseAdmin
      .from('owners')
      .select('id, user_id, store_name')
      .in('id', ownerCandidates)
    : { data: [] };

  const ownerById = new Map((owners ?? []).map(owner => [String(owner.id), owner]));
  const ownerRow = ownerCandidates.map(id => ownerById.get(String(id))).find(Boolean);
  const ownerUserId = ownerRow?.user_id ?? vehicle?.owner_auth_id ?? reservation.owner_id ?? null;
  const vehicleName = [vehicle?.maker, vehicle?.model].filter(Boolean).join(' ').trim();

  return {
    reservationId,
    userId: reservation.user_id ?? null,
    ownerUserId,
    ownerName: ownerRow?.store_name ?? 'オーナー',
    vehicleId: reservation.vehicle_id ?? null,
    vehicleName,
  };
}

async function sendReviewBroadcast(recipientId, payload) {
  if (!recipientId) return;
  const channel = supabaseAdmin.channel(`notify:${recipientId}`);
  await channel.send({
    type: 'broadcast',
    event: 'new_review',
    payload,
  });
}

async function notifyReviewParticipants({ reservationId, reviewerRole }) {
  try {
    const actors = await resolveReviewNotificationActors(reservationId);
    if (!actors) return;

    const { data: reviews } = await supabaseAdmin
      .from('reviews')
      .select('reviewer_role')
      .eq('reservation_id', reservationId);
    const roles = new Set((reviews ?? []).map(review => review.reviewer_role));
    const bothDone = roles.has('customer') && roles.has('host');

    const basePayload = {
      reservationId,
      vehicleId: actors.vehicleId,
      vehicleName: actors.vehicleName,
    };

    if (bothDone) {
      const message = 'レビューが公開されました。内容を確認できます。';
      await Promise.all([
        sendReviewBroadcast(actors.userId, { ...basePayload, type: 'review_revealed', message }),
        sendReviewBroadcast(actors.ownerUserId, { ...basePayload, type: 'review_revealed', message }),
      ]);
      return;
    }

    const recipientId = reviewerRole === 'customer' ? actors.ownerUserId : actors.userId;
    const message = 'レビューが届きました。あなたも評価を書きましょう。';
    await sendReviewBroadcast(recipientId, {
      ...basePayload,
      type: 'review_prompt',
      message,
      reviewerRole,
    });
  } catch (error) {
    console.warn('[reviews notify]', error.message);
  }
}

export async function GET(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('reservationId');
  const userId        = searchParams.get('userId');
  const ownerId       = searchParams.get('ownerId');

  if (reservationId) return getReviewsForReservation(reservationId);
  if (userId) return getReviewsForUser(userId);
  if (ownerId) return getReviewsForOwner(ownerId);
  return NextResponse.json({ error: 'reservationId, userId, or ownerId required' }, { status: 400 });
}

async function getReviewsForReservation(reservationId) {
  const { data: res } = await supabaseAdmin
    .from('reservations')
    .select('id, return_at, review_deadline, status')
    .eq('id', reservationId)
    .single();

  if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

  const { data: reviews } = await supabaseAdmin
    .from('reviews')
    .select('*')
    .eq('reservation_id', reservationId);

  const roles = new Set((reviews ?? []).map(review => review.reviewer_role));
  const deadline = res.review_deadline ? new Date(res.review_deadline) : null;
  const now = new Date();
  const bothReviewed = roles.has('customer') && roles.has('host');
  const expired = deadline && now > deadline;
  const revealed = bothReviewed || expired;

  return NextResponse.json({
    reviews: reviews ?? [],
    revealed,
    bothReviewed,
    expired,
    deadline: res.review_deadline,
  });
}

async function getReviewsForUser(userId) {
  const { data: reviews, error } = await supabaseAdmin
    .from('reviews')
    .select('*, reservations!inner(review_deadline)')
    .eq('reviewee_id', userId)
    .eq('reviewer_role', 'host');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(buildReviewProfile(await visibleReviews(reviews ?? []), 'user'));
}

async function getReviewsForOwner(ownerId) {
  const reservationIds = await reservationIdsForOwner(ownerId);
  if (reservationIds.length === 0) {
    return NextResponse.json(buildReviewProfile([], 'owner'));
  }

  const { data: reviews, error } = await supabaseAdmin
    .from('reviews')
    .select('*, reservations!inner(review_deadline)')
    .in('reservation_id', reservationIds)
    .eq('reviewer_role', 'customer');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(buildReviewProfile(await visibleReviews(reviews ?? []), 'owner'));
}

async function fallbackRevieweeId({ reservationId, reviewerRole }) {
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('id, user_id, owner_id, vehicle_id')
    .eq('id', reservationId)
    .maybeSingle();

  if (!reservation) return null;
  if (reviewerRole === 'host') return reservation.user_id ?? null;
  if (reservation.owner_id) return reservation.owner_id;
  if (!reservation.vehicle_id) return null;

  const { data: vehicle } = await supabaseAdmin
    .from('vehicles')
    .select('owner_id')
    .eq('id', reservation.vehicle_id)
    .maybeSingle();
  return vehicle?.owner_id ?? null;
}

export async function POST(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    reservationId,
    reviewerId,
    revieweeId,
    reviewerRole,
    rating,
    comment,
    isAuto = false,
  } = await req.json();

  if (!reservationId || !reviewerRole || rating === undefined) {
    return NextResponse.json({ error: 'reservationId, reviewerRole, rating required' }, { status: 400 });
  }
  if (reviewerRole !== 'customer' && reviewerRole !== 'host') {
    return NextResponse.json({ error: 'reviewerRole must be customer or host' }, { status: 400 });
  }
  const normalizedRating = Number(rating);
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('reviews')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('reviewer_role', reviewerRole)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Review already submitted' }, { status: 409 });
  }

  const finalRevieweeId = revieweeId ?? await fallbackRevieweeId({ reservationId, reviewerRole });
  const { data: review, error } = await supabaseAdmin
    .from('reviews')
    .insert({
      reservation_id: reservationId,
      reviewer_id: reviewerId ?? null,
      reviewee_id: finalRevieweeId ?? null,
      reviewer_role: reviewerRole,
      rating: normalizedRating,
      comment: comment ? String(comment).slice(0, 500) : null,
      is_auto: Boolean(isAuto),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await maybeCompleteReservation(reservationId);
  await notifyReviewParticipants({ reservationId, reviewerRole });

  return NextResponse.json(review, { status: 201 });
}

async function maybeCompleteReservation(reservationId) {
  const { data: reviews } = await supabaseAdmin
    .from('reviews')
    .select('reviewer_role')
    .eq('reservation_id', reservationId);

  const roles = (reviews ?? []).map(review => review.reviewer_role);
  const bothDone = roles.includes('customer') && roles.includes('host');

  if (bothDone) {
    await supabaseAdmin
      .from('reservations')
      .update({ status: 'completed', payout_enabled: true })
      .eq('id', reservationId);
  }
}
