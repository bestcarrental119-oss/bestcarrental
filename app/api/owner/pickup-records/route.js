/**
 * Owner-side saved pickup (IDP) records.
 *
 * POST /api/owner/pickup-records
 *   Body: { ownerId, token }
 *   The owner scans a renter's QR (which contains the opaque token). We resolve
 *   the reservation, verify it belongs to this owner, copy the IDP snapshot +
 *   reservation info into owner_pickup_records. Records auto-expire 30 days
 *   after the return date. Pickup is started by the explicit "貸出開始" action.
 *   Returns the saved record (incl. documents) so the owner sees it immediately.
 *
 * GET /api/owner/pickup-records?ownerId=...
 *   Lists the owner's saved records (for print / CSV / image export).
 *
 * DELETE /api/owner/pickup-records?id=...&ownerId=...
 *   Manually delete one record.
 */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';
import { signUrl, BUCKET_HANDOVER, BUCKET_IDP } from '../../../../lib/storage';
import {
  hasCompleteDepartureInspectionPhotos,
  hasCompleteReturnInspectionPhotos,
} from '../../../../lib/inspectionPhotos';
import {
  AUTHORIZED_PAYMENT_STATUS,
  stripeIdempotencyKey,
} from '../../../../lib/paymentAuthorization';

const RETENTION_DAYS = 30;
const PHOTO_BUCKET = 'handover-photos';
const PICKUP_ACTIVE_STATUS = 'in_progress';
const RETURN_REVIEW_STATUS = 'waiting_review';
const REVIEW_WINDOW_DAYS = 14;
const CLOSED_PICKUP_STATUSES = new Set(['cancelled', 'canceled', 'rejected', 'completed']);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' });

const inspectionRequiredError = () => NextResponse.json(
  {
    error: 'Departure 10-photo inspection is required before pickup can be completed.',
    code: 'departure_inspection_required',
  },
  { status: 409 },
);

const returnInspectionRequiredError = () => NextResponse.json(
  {
    error: 'Return 10-photo inspection is required before return can be completed.',
    code: 'return_inspection_required',
  },
  { status: 409 },
);

async function hasCompleteDepartureInspection(reservationId) {
  if (!reservationId) return false;
  const { data } = await supabaseAdmin
    .from('damage_inspections')
    .select('photos')
    .eq('reservation_id', reservationId)
    .maybeSingle();
  return hasCompleteDepartureInspectionPhotos(data?.photos ?? {});
}

async function hasCompleteReturnInspection(reservationId) {
  if (!reservationId) return false;
  const { data } = await supabaseAdmin
    .from('damage_inspections')
    .select('photos')
    .eq('reservation_id', reservationId)
    .maybeSingle();
  return hasCompleteReturnInspectionPhotos(data?.photos ?? {});
}

async function markPickupVerified(reservationId, verifiedAt, extraReservationPatch = {}) {
  const { error } = await supabaseAdmin.from('reservations')
    .update({
      ...extraReservationPatch,
      pickup_verified_at: verifiedAt,
      status: PICKUP_ACTIVE_STATUS,
    })
    .eq('id', reservationId);
  if (error) throw error;

  const { data: oneWayListing } = await supabaseAdmin
    .from('one_way_listings')
    .select('source_cross_return_id')
    .eq('reservation_id', reservationId)
    .not('source_cross_return_id', 'is', null)
    .maybeSingle();
  if (oneWayListing?.source_cross_return_id) {
    await supabaseAdmin.from('cross_returns')
      .update({
        home_return_status: 'one_way_returning',
        home_return_started_at: verifiedAt,
        updated_at: verifiedAt,
      })
      .eq('id', oneWayListing.source_cross_return_id)
      .eq('home_return_status', 'one_way_booked');
  }
}

function reservationStateForRecord(record, reservation) {
  const info = record?.reservation_info ?? {};
  return {
    ...record,
    pickup_verified_at: reservation?.pickup_verified_at ?? record?.pickup_verified_at ?? null,
    reservation_info: {
      ...info,
      status: reservation?.status ?? info.status,
      paymentStatus: reservation?.payment_status ?? info.paymentStatus,
      pickupVerifiedAt: reservation?.pickup_verified_at ?? info.pickupVerifiedAt ?? null,
      stripePaidAmount: reservation?.stripe_paid_amount ?? info.stripePaidAmount ?? null,
      reviewDeadline: reservation?.review_deadline ?? info.reviewDeadline ?? null,
    },
  };
}

function reviewDeadlineFrom(returnCompletedAt) {
  return new Date(new Date(returnCompletedAt).getTime() + REVIEW_WINDOW_DAYS * 86400000).toISOString();
}

async function captureAuthorizedPaymentIfNeeded(reservation) {
  const paymentStatus = String(reservation?.payment_status ?? '').toLowerCase();
  if (paymentStatus === 'paid') return {};
  if (paymentStatus !== AUTHORIZED_PAYMENT_STATUS || !reservation?.stripe_payment_intent_id) {
    const err = new Error('Payment authorization is required before pickup can be started.');
    err.code = 'pickup_payment_not_ready';
    throw err;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('Stripe is not configured.');
    err.code = 'stripe_not_configured';
    throw err;
  }

  const captureAmount = Math.max(0, Number(reservation.total ?? 0));
  if (captureAmount <= 0) {
    const err = new Error('Invalid capture amount.');
    err.code = 'invalid_capture_amount';
    throw err;
  }

  await stripe.paymentIntents.capture(
    reservation.stripe_payment_intent_id,
    {
      amount_to_capture: Math.round(captureAmount),
      final_capture: true,
      metadata: {
        platform: 'best-car-rental',
        reservationId: String(reservation.id),
        kind: 'pickup-full-capture',
      },
    },
    { idempotencyKey: stripeIdempotencyKey('capture-pickup', reservation.id) },
  );

  return {
    payment_status: 'paid',
    stripe_paid_amount: Math.round(captureAmount),
  };
}

export async function POST(req) {
  try {
    const { ownerId, token } = await req.json();
    if (!ownerId || !token) {
      return NextResponse.json({ error: 'ownerId and token are required' }, { status: 400 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

    // Resolve the reservation from the scanned token.
    const { data: r, error } = await supabaseAdmin
      .from('reservations')
      .select('id, owner_id, user_id, vehicle_id, target_class, pickup_at, return_at, total, status, payment_status, pickup_verified_at, idp_snapshot, pickup_token')
      .eq('pickup_token', token)
      .single();

    if (error || !r) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });

    // Security: the reservation must belong to the scanning owner.
    // (owner_id may be the owner row id or the owner's user_id.)
    let ownerRowIds = [String(ownerId)];
    const { data: ownerRow } = await supabaseAdmin
      .from('owners').select('id, user_id')
      .or(`id.eq.${ownerId},user_id.eq.${ownerId}`).maybeSingle();
    if (ownerRow) ownerRowIds = [...new Set([...ownerRowIds, ownerRow.id, ownerRow.user_id].filter(Boolean).map(String))];
    if (r.owner_id && !ownerRowIds.includes(String(r.owner_id))) {
      return NextResponse.json({ error: 'This booking is not assigned to your store.' }, { status: 403 });
    }

    const snap = r.idp_snapshot ?? {};
    const purgeAfter = r.return_at
      ? new Date(new Date(r.return_at).getTime() + RETENTION_DAYS * 86400000).toISOString()
      : new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();

    const record = {
      owner_id: String(ownerId),
      reservation_id: r.id,
      token,
      renter_name: snap.name ?? null,
      nat: snap.nat ?? null,
      reservation_info: {
        reservationId: r.id,
        vehicleId: r.vehicle_id,
        targetClass: r.target_class,
        pickupAt: r.pickup_at,
        returnAt: r.return_at,
        total: r.total,
        status: r.status,
        paymentStatus: r.payment_status,
        pickupVerifiedAt: r.pickup_verified_at,
      },
      documents: snap.documents ?? {},
      scanned_at: new Date().toISOString(),
      purge_after: purgeAfter,
    };

    const { data: saved, error: upErr } = await supabaseAdmin
      .from('owner_pickup_records')
      .upsert(record, { onConflict: 'owner_id,reservation_id' })
      .select()
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const inspectionComplete = await hasCompleteDepartureInspection(r.id);
    const pickupVerified = Boolean(r.pickup_verified_at);

    return NextResponse.json({
      ok: true,
      record: reservationStateForRecord(saved, r),
      pickupVerified,
      requiresInspection: !inspectionComplete,
      readyForPickupStart: inspectionComplete && !pickupVerified,
    });
  } catch (err) {
    console.error('[POST /api/owner/pickup-records]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const ownerId = new URL(req.url).searchParams.get('ownerId');
    if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json([]);

    const { data, error } = await supabaseAdmin
      .from('owner_pickup_records')
      .select('*')
      .eq('owner_id', ownerId)
      .gt('purge_after', new Date().toISOString())
      .order('scanned_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const records = Array.isArray(data) ? data : [];
    const reservationIds = [...new Set(records.map(r => r.reservation_id).filter(Boolean).map(String))];
    let reservationsById = new Map();
    if (reservationIds.length > 0) {
      const { data: reservations } = await supabaseAdmin
        .from('reservations')
        .select('id, status, payment_status, pickup_verified_at, stripe_paid_amount, review_deadline')
        .in('id', reservationIds);
      reservationsById = new Map((reservations ?? []).map(r => [String(r.id), r]));
    }

    // Attach short-lived signed URLs for each stored image (private buckets).
    for (const rec of records) {
      if (Array.isArray(rec.photos)) {
        for (const p of rec.photos) {
          if (p.path) p.url = await signUrl(BUCKET_HANDOVER, p.path);
          else if (p.dataUrl) p.url = p.dataUrl; // legacy inline photo
        }
      }
      if (rec.documents && typeof rec.documents === 'object') {
        for (const v of Object.values(rec.documents)) {
          if (v?.path) v.url = await signUrl(BUCKET_IDP, v.path);
          else if (v?.dataUrl) v.url = v.dataUrl; // legacy inline document
        }
      }
      const reservation = reservationsById.get(String(rec.reservation_id));
      if (reservation) Object.assign(rec, reservationStateForRecord(rec, reservation));
    }
    return NextResponse.json(records);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/owner/pickup-records
 *   Body: { id, ownerId, photo: { phase, dataUrl, lat, lng, at } }
 *   Uploads the handover photo to Supabase Storage (object storage) and stores
 *   only a tiny reference { phase, path, lat, lng, at } in the DB — so the
 *   database stays small no matter how many photos are taken.
 */
export async function PATCH(req) {
  try {
    const { id, ownerId, photo, action } = await req.json();
    const isRecordAction = action === 'complete-pickup' || action === 'complete-return';
    if (!id || !ownerId || (!isRecordAction && !photo?.dataUrl)) {
      return NextResponse.json({ error: 'id, ownerId and photo are required' }, { status: 400 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

    if (action === 'complete-pickup') {
      const { data: rec, error } = await supabaseAdmin
        .from('owner_pickup_records')
        .select('id, reservation_id')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .single();
      if (error || !rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      const { data: reservation, error: reservationError } = await supabaseAdmin
        .from('reservations')
        .select('id, status, payment_status, total, stripe_paid_amount, stripe_payment_intent_id, pickup_verified_at')
        .eq('id', rec.reservation_id)
        .single();
      if (reservationError || !reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
      const reservationStatus = String(reservation.status ?? '').toLowerCase();
      if (CLOSED_PICKUP_STATUSES.has(reservationStatus)) {
        return NextResponse.json({ error: 'Reservation is closed' }, { status: 409 });
      }
      if (reservationStatus === PICKUP_ACTIVE_STATUS && reservation.pickup_verified_at) {
        return NextResponse.json({ ok: true, pickupVerified: true, alreadyStarted: true, record: rec });
      }
      const inspectionComplete = await hasCompleteDepartureInspection(rec.reservation_id);
      if (!inspectionComplete) return inspectionRequiredError();
      const paymentPatch = await captureAuthorizedPaymentIfNeeded(reservation);
      const verifiedAt = reservation.pickup_verified_at ?? new Date().toISOString();
      await markPickupVerified(rec.reservation_id, verifiedAt, paymentPatch);
      return NextResponse.json({ ok: true, pickupVerified: true, status: PICKUP_ACTIVE_STATUS, record: rec });
    }

    if (action === 'complete-return') {
      const { data: rec, error } = await supabaseAdmin
        .from('owner_pickup_records')
        .select('id, reservation_id')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .single();
      if (error || !rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      const { data: reservation, error: reservationError } = await supabaseAdmin
        .from('reservations')
        .select('id, status, review_deadline')
        .eq('id', rec.reservation_id)
        .single();
      if (reservationError || !reservation) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

      const reservationStatus = String(reservation.status ?? '').toLowerCase();
      if (reservationStatus === RETURN_REVIEW_STATUS || reservationStatus === 'completed') {
        return NextResponse.json({
          ok: true,
          returnCompleted: true,
          alreadyReturned: true,
          status: reservation.status,
          reviewDeadline: reservation.review_deadline ?? null,
          record: rec,
        });
      }
      if (reservationStatus !== PICKUP_ACTIVE_STATUS) {
        return NextResponse.json({
          error: 'Rental must be started before return can be completed.',
          code: 'return_not_in_progress',
        }, { status: 409 });
      }

      const inspectionComplete = await hasCompleteReturnInspection(rec.reservation_id);
      if (!inspectionComplete) return returnInspectionRequiredError();

      const completedAt = new Date().toISOString();
      const reviewDeadline = reviewDeadlineFrom(completedAt);
      const { error: updateError } = await supabaseAdmin
        .from('reservations')
        .update({
          status: RETURN_REVIEW_STATUS,
          review_deadline: reviewDeadline,
          payout_enabled: false,
        })
        .eq('id', rec.reservation_id);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        returnCompleted: true,
        status: RETURN_REVIEW_STATUS,
        reviewDeadline,
        record: rec,
      });
    }

    const { data: rec, error } = await supabaseAdmin
      .from('owner_pickup_records')
      .select('id, reservation_id, photos')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();
    if (error || !rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    const phase = photo.phase === 'return' ? 'return' : 'pickup';

    // Decode the data URL and upload the bytes to Storage.
    const m = /^data:(.+?);base64,(.*)$/s.exec(photo.dataUrl);
    if (!m) return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    const contentType = m[1] || 'image/jpeg';
    const buffer = Buffer.from(m[2], 'base64');
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${ownerId}/${rec.reservation_id || rec.id}/${phase}-${Date.now()}.${ext}`;

    const { error: upErr0 } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr0) return NextResponse.json({ error: `Storage: ${upErr0.message}` }, { status: 500 });

    const entry = {
      phase,
      path,                                   // storage path only — not the image bytes
      lat: photo.lat ?? null,
      lng: photo.lng ?? null,
      at: photo.at ?? new Date().toISOString(),
    };
    const photos = [...(Array.isArray(rec.photos) ? rec.photos : []), entry].slice(-40);

    const { data: saved, error: upErr } = await supabaseAdmin
      .from('owner_pickup_records')
      .update({ photos })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Return the freshly-signed URL so the UI shows the new photo immediately.
    const { data: signed } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
    return NextResponse.json({ ok: true, record: saved, photoUrl: signed?.signedUrl ?? null });
  } catch (err) {
    if (err.code === 'pickup_payment_not_ready') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err.code === 'stripe_not_configured') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    if (err.code === 'invalid_capture_amount') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const ownerId = url.searchParams.get('ownerId');
    if (!id || !ownerId) return NextResponse.json({ error: 'id and ownerId required' }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

    const { error } = await supabaseAdmin
      .from('owner_pickup_records')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
