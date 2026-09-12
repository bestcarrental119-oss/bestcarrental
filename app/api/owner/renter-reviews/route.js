/**
 * GET /api/owner/renter-reviews?ownerId=xxx
 *
 * Returns renter reputation for people who have reservations with this owner.
 * The aggregate uses revealed host→renter reviews from all owners, so the
 * owner can judge whether to lend before accepting a reservation.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

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

function revealDeadlinePassed(review, now = new Date()) {
  const deadline = review.reservations?.review_deadline
    ? new Date(review.reservations.review_deadline)
    : null;
  return !deadline || now > deadline;
}

async function reservationReviewRoles(reservationIds) {
  if (!reservationIds.length) return new Map();
  const { data } = await supabaseAdmin
    .from('reviews')
    .select('reservation_id, reviewer_role')
    .in('reservation_id', reservationIds);

  const byReservation = new Map();
  for (const review of data ?? []) {
    const key = String(review.reservation_id);
    const roles = byReservation.get(key) ?? new Set();
    roles.add(review.reviewer_role);
    byReservation.set(key, roles);
  }
  return byReservation;
}

function isRevealed(review, rolesByReservation) {
  const roles = rolesByReservation.get(String(review.reservation_id)) ?? new Set();
  return (roles.has('customer') && roles.has('host')) || revealDeadlinePassed(review);
}

async function ownerVehicleIds(ownerLookupIds) {
  const [byOwner, byOwnerAuth] = await Promise.all([
    supabaseAdmin.from('vehicles').select('id, owner_id, owner_auth_id').in('owner_id', ownerLookupIds),
    supabaseAdmin.from('vehicles').select('id, owner_id, owner_auth_id').in('owner_auth_id', ownerLookupIds),
  ]);
  return [...new Set([...(byOwner.data ?? []), ...(byOwnerAuth.data ?? [])].map(vehicle => vehicle.id).filter(Boolean))];
}

async function ownerReservations(ownerLookupIds, vehicleIds) {
  const [byVehicle, byOwner] = await Promise.all([
    vehicleIds.length
      ? supabaseAdmin.from('reservations').select('id, user_id, review_deadline, owner_id, vehicle_id').in('vehicle_id', vehicleIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('reservations').select('id, user_id, review_deadline, owner_id, vehicle_id').in('owner_id', ownerLookupIds),
  ]);

  const byId = new Map();
  [...(byVehicle.data ?? []), ...(byOwner.data ?? [])].forEach(reservation => {
    if (reservation?.id) byId.set(String(reservation.id), reservation);
  });
  return [...byId.values()];
}

async function loadOwnerNamesForReviews(reviews) {
  const reservationIds = [...new Set((reviews ?? []).map(review => review.reservation_id).filter(Boolean))];
  if (!reservationIds.length) return new Map();

  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('id, owner_id, vehicle_id')
    .in('id', reservationIds);
  const vehicleIds = [...new Set((reservations ?? []).map(r => r.vehicle_id).filter(Boolean))];
  const { data: vehicles } = vehicleIds.length
    ? await supabaseAdmin.from('vehicles').select('id, owner_id').in('id', vehicleIds)
    : { data: [] };

  const vehicleOwnerById = new Map((vehicles ?? []).map(vehicle => [String(vehicle.id), vehicle.owner_id]));
  const ownerIds = [...new Set((reservations ?? [])
    .map(reservation => reservation.owner_id ?? vehicleOwnerById.get(String(reservation.vehicle_id)))
    .filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin.from('owners').select('id, store_name').in('id', ownerIds)
    : { data: [] };
  const ownerNameById = new Map((owners ?? []).map(owner => [String(owner.id), owner.store_name]));

  return new Map((reservations ?? []).map(reservation => {
    const ownerId = reservation.owner_id ?? vehicleOwnerById.get(String(reservation.vehicle_id));
    return [String(reservation.id), ownerNameById.get(String(ownerId)) ?? '別のオーナー'];
  }));
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ given: [], renterStats: {} });

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 });

  const ownerLookupIds = await resolveOwnerLookupIds(ownerId);
  if (!ownerLookupIds.length) return NextResponse.json({ given: [], renterStats: {} });

  const vehicleIds = await ownerVehicleIds(ownerLookupIds);
  const reservations = await ownerReservations(ownerLookupIds, vehicleIds);
  const resIds = reservations.map(r => r.id);
  const renterIds = [...new Set(reservations.map(r => r.user_id).filter(Boolean))];
  if (renterIds.length === 0) return NextResponse.json({ given: [], renterStats: {} });

  const { data: given } = resIds.length
    ? await supabaseAdmin.from('reviews').select('*').in('reservation_id', resIds).eq('reviewer_role', 'host')
    : { data: [] };

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, name, email')
    .in('id', renterIds);
  const nameMap = Object.fromEntries((users ?? []).map(user => [user.id, user]));

  const { data: received } = await supabaseAdmin
    .from('reviews')
    .select('id, reservation_id, reviewee_id, rating, comment, created_at, is_auto, reservations!inner(review_deadline)')
    .eq('reviewer_role', 'host')
    .in('reviewee_id', renterIds);

  const rolesByReservation = await reservationReviewRoles([...(received ?? []).map(review => review.reservation_id)]);
  const ownerNameByReservation = await loadOwnerNamesForReviews(received ?? []);
  const renterStats = {};

  for (const uid of renterIds) {
    const user = nameMap[uid] || {};
    const recentReviews = (received ?? [])
      .filter(review => String(review.reviewee_id) === String(uid) && isRevealed(review, rolesByReservation))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(review => ({
        id: review.id,
        reservationId: review.reservation_id,
        rating: review.rating,
        comment: review.comment,
        isAuto: review.is_auto,
        createdAt: review.created_at,
        reviewerOwnerName: ownerNameByReservation.get(String(review.reservation_id)) ?? '別のオーナー',
      }));
    const count = recentReviews.length;
    const avg = count ? recentReviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / count : null;
    renterStats[uid] = {
      name: user.name ?? '—',
      email: user.email ?? '',
      avg,
      count,
      ratingPoints: avg == null ? null : Math.round(avg * 20),
      lowRatingCount: recentReviews.filter(review => Number(review.rating ?? 0) <= 2).length,
      recentReviews: recentReviews.slice(0, 5),
    };
  }

  return NextResponse.json({ given: given ?? [], renterStats });
}
