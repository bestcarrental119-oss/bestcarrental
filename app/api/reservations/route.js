import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { getReservations, getVehicles, saveReservation } from '../../../lib/kv';
import { sendEmail } from '../../../lib/email';
import {
  BOOKING_TYPES,
  ASSIGNMENT_STATUS,
  calculateClassAvailability,
  normalizeVehicleClass,
} from '../../../lib/runOfFleet';

export const dynamic = 'force-dynamic';

const PENDING_REVIEW_STATUSES = new Set(['waiting_review', 'completed', 'confirmed']);
const OWNER_RESERVATION_NOTIFY_STATUSES = new Set(['pending', 'confirmed', 'pending_assignment']);

function reservationNeedsCustomerReview(row, reviewedReservationIds = new Set(), now = new Date()) {
  const status = String(row?.status ?? '').toLowerCase();
  if (!PENDING_REVIEW_STATUSES.has(status)) return false;
  const returnAt = row?.return_at ?? row?.ret;
  if (!returnAt) return false;
  const returnDate = new Date(returnAt);
  if (Number.isNaN(returnDate.getTime()) || returnDate > now) return false;
  return !reviewedReservationIds.has(String(row.id));
}

async function countPendingCustomerReviews(userId) {
  const now = new Date();
  if (!supabaseAdmin) {
    const reservations = await getReservations();
    return reservations.filter(r =>
      String(r.userId ?? r.user_id) === String(userId)
      && reservationNeedsCustomerReview(r, new Set(), now)
    ).length;
  }

  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select('id, status, return_at')
    .eq('user_id', userId)
    .in('status', [...PENDING_REVIEW_STATUSES]);
  if (error) throw error;

  const reservationIds = (reservations ?? []).map(r => r.id);
  if (reservationIds.length === 0) return 0;

  const { data: reviews, error: reviewError } = await supabaseAdmin
    .from('reviews')
    .select('reservation_id')
    .eq('reviewer_role', 'customer')
    .in('reservation_id', reservationIds);
  if (reviewError) throw reviewError;

  const reviewedReservationIds = new Set((reviews ?? []).map(r => String(r.reservation_id)));
  return (reservations ?? []).filter(r => reservationNeedsCustomerReview(r, reviewedReservationIds, now)).length;
}

async function loadStripePaidAmount(stripePaymentIntentId) {
  if (!stripePaymentIntentId || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (paymentIntent.status !== 'succeeded') return null;
    return Number(paymentIntent.amount_received || paymentIntent.amount || 0);
  } catch (error) {
    console.warn('[reservations] Stripe paid amount lookup failed:', error.message);
    return null;
  }
}

function shouldNotifyOwnerReservation(reservation, { phase = 'save' } = {}) {
  const status = String(reservation?.status ?? '').toLowerCase();
  if (status === 'payment_pending') return false;
  if (phase === 'create' && status === 'pending_assignment') return false;
  return OWNER_RESERVATION_NOTIFY_STATUSES.has(status);
}

function reservationOwnerMessage(reservation, storeName) {
  const reservationId = reservation?.id ? `（予約ID: ${reservation.id}）` : '';
  return `${storeName ?? '店舗'}に新しい予約が入りました${reservationId}`;
}

function extractEmail(value) {
  return String(value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reservationOwnerEmailValue(value) {
  const text = value ? String(value) : '未設定';
  return escapeHtml(text);
}

async function sendOwnerReservationEmail(reservation, recipient) {
  const to = recipient?.email;
  if (!to) return { skipped: true, reason: 'missing owner email' };

  const storeName = recipient?.storeName ?? '店舗';
  const total = Number(reservation?.stripe_paid_amount ?? reservation?.total ?? 0).toLocaleString('ja-JP');
  const rows = [
    ['店舗', storeName],
    ['予約ID', reservation?.id],
    ['ステータス', reservation?.status],
    ['受取日時', reservation?.pickup_at],
    ['返却日時', reservation?.return_at],
    ['受取場所', reservation?.pickup_loc],
    ['返却場所', reservation?.return_loc],
    ['合計金額', `¥${total}`],
  ];

  const detailRows = rows
    .map(([label, value]) => `
      <tr>
        <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #eee;color:#6b7280;font-weight:600;width:110px">${escapeHtml(label)}</th>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#111827">${reservationOwnerEmailValue(value)}</td>
      </tr>
    `)
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
      <div style="background:#6d28d9;color:#fff;border-radius:14px;padding:18px 20px">
        <h1 style="font-size:20px;line-height:1.4;margin:0">${escapeHtml(reservationOwnerMessage(reservation, storeName))}</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:18px 20px;background:#fff">
        <p style="font-size:14px;line-height:1.7;margin:0 0 14px;color:#374151">
          オーナーバックエンドで予約内容を確認し、必要に応じてお客様への対応を進めてください。
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${detailRows}</table>
        <p style="color:#9ca3af;font-size:12px;margin:18px 0 0">BEST CAR RENTAL 自動通知</p>
      </div>
    </div>
  `;

  return await sendEmail({
    to,
    subject: `新しい予約が入りました - ${storeName}`,
    html,
  });
}

async function resolveReservationOwnerRecipient(reservation) {
  if (!supabaseAdmin || !reservation?.owner_id) return null;
  const ownerId = String(reservation.owner_id);
  const [byOwnerId, byUserId] = await Promise.all([
    supabaseAdmin
      .from('owners')
      .select('id, user_id, store_name, email, booking_email_contact')
      .eq('id', ownerId)
      .maybeSingle(),
    supabaseAdmin
      .from('owners')
      .select('id, user_id, store_name, email, booking_email_contact')
      .eq('user_id', ownerId)
      .maybeSingle(),
  ]);
  const owner = byOwnerId.data ?? byUserId.data ?? null;
  return {
    recipientId: owner?.user_id ?? reservation.owner_id,
    ownerId: owner?.id ?? reservation.owner_id,
    storeName: owner?.store_name ?? '店舗',
    email: extractEmail(owner?.email) || extractEmail(owner?.booking_email_contact),
  };
}

async function notifyOwnerReservation(reservation, { phase = 'save' } = {}) {
  if (!supabaseAdmin || !shouldNotifyOwnerReservation(reservation, { phase })) return;
  try {
    const recipient = await resolveReservationOwnerRecipient(reservation);
    const recipientId = recipient?.recipientId;
    if (!recipientId) return;

    const storeName = recipient?.storeName ?? '店舗';
    const channel = supabaseAdmin.channel(`notify:${recipientId}`);
    await channel.send({
      type: 'broadcast',
      event: 'new_reservation',
      payload: {
        reservationId: reservation.id,
        ownerId: recipient?.ownerId ?? reservation.owner_id,
        storeName,
        status: reservation.status,
        pickupAt: reservation.pickup_at,
        returnAt: reservation.return_at,
        message: reservationOwnerMessage(reservation, storeName),
      },
    });
    await sendOwnerReservationEmail(reservation, recipient);
  } catch (error) {
    console.warn('[reservations notify]', error.message);
  }
}

async function sendReservationConfirmationEmail(reservation) {
  if (!reservation?.guest_email) return { skipped: true, reason: 'missing guest email' };
  let owner = null;
  let vehicle = null;
  try {
    const [ownerRes, vehicleRes] = await Promise.all([
      reservation.owner_id
        ? supabaseAdmin.from('owners').select('store_name, phone, email, booking_email_contact').eq('id', reservation.owner_id).maybeSingle()
        : Promise.resolve({ data: null }),
      reservation.vehicle_id
        ? supabaseAdmin.from('vehicles').select('maker, model, loc').eq('id', reservation.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    owner = ownerRes.data;
    vehicle = vehicleRes.data;
  } catch (error) {
    console.warn('[reservations] email context lookup failed:', error.message);
  }

  const storeContact = owner?.booking_email_contact
    || [owner?.store_name, owner?.phone, owner?.email].filter(Boolean).join('\n')
    || 'Store contact is being prepared. The owner will contact you soon.';
  const vehicleLabel = vehicle
    ? `${vehicle.maker ?? ''} ${vehicle.model ?? ''}`.trim()
    : (reservation.target_class ? `${reservation.target_class} class` : 'Vehicle');
  const lines = [
    'Thank you for booking with BEST CAR RENTAL.',
    '',
    `Reservation ID: ${reservation.id}`,
    `Vehicle: ${vehicleLabel}`,
    `Pickup: ${reservation.pickup_at}`,
    `Return: ${reservation.return_at}`,
    `Total paid: ¥${Number(reservation.stripe_paid_amount ?? reservation.total ?? 0).toLocaleString('ja-JP')}`,
    '',
    'Store contact:',
    storeContact,
    '',
    'BEST CAR RENTAL',
  ];

  if (!process.env.RESEND_API_KEY) {
    console.log('[reservations] RESEND_API_KEY not set; confirmation email skipped:', {
      reservationId: reservation.id,
      to: reservation.guest_email,
    });
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESERVATION_EMAIL_FROM || 'BEST CAR RENTAL <bookings@bestcarrental.example>',
      to: reservation.guest_email,
      subject: `BEST CAR RENTAL Reservation ${reservation.id}`,
      text: lines.join('\n'),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Email send failed: ${response.status} ${text}`);
  }
  return { sent: true };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  // 未レビュー確認
  const userId      = searchParams.get('userId');
  const checkPending = searchParams.get('checkPending');
  if (userId && checkPending) {
    try {
      const pendingCount = await countPendingCustomerReviews(userId);
      return NextResponse.json({ hasPending: pendingCount > 0, pendingCount });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

  if (!supabaseAdmin) {
    try {
      const all = await getReservations();
      const list = userId ? all.filter(r => String(r.userId ?? r.user_id) === String(userId)) : all;
      return NextResponse.json(list, { headers: NO_CACHE });
    }
    catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  }

  // フィルタ: 特定ユーザーの予約のみ（マイページで最新を取得するため）
  let query = supabaseAdmin.from('reservations').select('*').order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(dbToReservation), { headers: NO_CACHE });
}

export async function POST(req) {
  const body = await req.json();
  const bookingType = body.bookingType ?? body.booking_type ?? (body.vehicleId ? BOOKING_TYPES.SPECIFIC : BOOKING_TYPES.CLASS_BASED);
  const isClassBasedBooking = bookingType === 'class_based';
  const pendingAssignmentStatus = 'pending_assignment';

  if (!supabaseAdmin) {
    try {
      if (isClassBasedBooking) {
        const [vehicles, reservations] = await Promise.all([getVehicles(), getReservations()]);
        const inventory = calculateClassAvailability({
          vehicles,
          reservations,
          ownerId: body.ownerId,
      targetClass: body.targetClass,
      pickup: body.pickup,
      ret: body.ret,
      location: body.pickupLoc,
        });
        if (inventory.availableCount <= 0) {
          return NextResponse.json({ error: 'このクラスのおまかせ在庫は満車です。' }, { status: 409 });
        }
      }
      const saved = await saveReservation({
        ...body,
        vehicleId: isClassBasedBooking ? null : body.vehicleId,
        bookingType,
        targetClass: normalizeVehicleClass(body.targetClass),
        assignmentStatus: isClassBasedBooking
          ? pendingAssignmentStatus
          : ASSIGNMENT_STATUS.ASSIGNED,
        status: isClassBasedBooking
          ? pendingAssignmentStatus
          : (body.status ?? 'pending'),
      });
      const savedRow = Array.isArray(saved)
        ? saved.find(r => String(r.id) === String(body.id))
        : saved;
      return NextResponse.json(savedRow ?? body);
    }
    catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  }

  // ── Block check: has the vehicle's owner blocked this renter? ──
  {
    const renterId = body.userId ?? body.user_id ?? null;
    let blockOwnerId = body.ownerId ?? body.owner_id ?? null;
    if (renterId) {
      if (!blockOwnerId && (body.vehicleId ?? body.vehicle_id)) {
        const { data: veh } = await supabaseAdmin
          .from('vehicles').select('owner_id')
          .eq('id', body.vehicleId ?? body.vehicle_id).maybeSingle();
        blockOwnerId = veh?.owner_id ?? null;
      }
      if (blockOwnerId) {
        const { data: blocked } = await supabaseAdmin
          .from('renter_blocks').select('user_id')
          .eq('owner_id', blockOwnerId).eq('user_id', renterId).maybeSingle();
        if (blocked) {
          return NextResponse.json(
            { error: 'この加盟店では現在ご予約いただけません。', code: 'renter_blocked' },
            { status: 403 },
          );
        }
      }
    }
  }

  if (isClassBasedBooking) {
    const row = reservationToDbRow({
      ...body,
      vehicleId: null,
      status: pendingAssignmentStatus,
      bookingType: BOOKING_TYPES.CLASS_BASED,
      assignmentStatus: pendingAssignmentStatus,
    });

    const [vRes, rRes] = await Promise.all([
      supabaseAdmin.from('vehicles').select('*').eq('owner_id', row.owner_id).eq('status', 'active'),
      supabaseAdmin
        .from('reservations')
        .select('*')
        .eq('owner_id', row.owner_id)
        .not('status', 'in', '("cancelled","canceled","rejected")')
        .lt('pickup_at', row.return_at)
        .gt('return_at', row.pickup_at),
    ]);
    if (vRes.error) return NextResponse.json({ error: vRes.error.message }, { status: 500 });
    if (rRes.error) return NextResponse.json({ error: rRes.error.message }, { status: 500 });

    const inventory = calculateClassAvailability({
      vehicles: vRes.data ?? [],
      reservations: rRes.data ?? [],
      ownerId: row.owner_id,
      targetClass: row.target_class,
      pickup: row.pickup_at,
      ret: row.return_at,
      location: row.pickup_loc,
    });
    if (inventory.availableCount <= 0) {
      return NextResponse.json({ error: 'このクラスのおまかせ在庫は満車です。' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert(row)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notifyOwnerReservation(data, { phase: 'create' });
    return NextResponse.json(dbToReservation(data), { status: 201 });
  }

  // ── 重複予約チェック ───────────────────────────────────────────
  if (body.vehicleId && body.pickup && body.ret) {
    const { data: conflicts } = await supabaseAdmin
      .from('reservations')
      .select('id, pickup_at, return_at, status')
      .eq('vehicle_id', body.vehicleId)
      .not('status', 'in', '("cancelled","rejected")')
      .lt('pickup_at', body.ret)
      .gt('return_at', body.pickup);

    // 同じIDの更新は除外
    const realConflicts = (conflicts ?? []).filter(r => r.id !== body.id);

    if (realConflicts.length > 0) {
      return NextResponse.json({
        error: 'この車両は指定期間に既に予約されています。別の日程をお選びください。',
        conflictingReservations: realConflicts.map(r => ({
          pickup: r.pickup_at,
          ret: r.return_at,
        })),
      }, { status: 409 });
    }
  }

  const full = reservationToDbRow({
    ...body,
    bookingType: BOOKING_TYPES.SPECIFIC,
    assignmentStatus: ASSIGNMENT_STATUS.ASSIGNED,
  });

  // フル版で試みる
  let result = await supabaseAdmin
    .from('reservations')
    .upsert(full, { onConflict: 'id' })
    .select()
    .single();

  // 失敗したら最小カラムで再試行
  if (result.error) {
    console.warn('[reservations] Full insert failed, trying minimal:', result.error.message);
    const minimal = {
      id:         body.id,
      vehicle_id: body.vehicleId  ?? null,
      user_id:    body.userId     ?? null,
      pickup_at:  body.pickup     ?? null,
      return_at:  body.ret        ?? null,
      days:       body.days       ?? 1,
      total:      body.total      ?? 0,
      status:     body.status     ?? 'pending',
      type:       body.type       ?? 'corporate',
      opts:       body.opts       ?? {},
      pickup_loc: body.pickupLoc  ?? null,
      return_loc: body.retLoc     ?? null,
    };
    result = await supabaseAdmin
      .from('reservations')
      .upsert(minimal, { onConflict: 'id' })
      .select()
      .single();
  }

  if (result.error) {
    console.error('[reservations] Insert failed:', result.error.message);
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  await notifyOwnerReservation(result.data, { phase: 'create' });
  return NextResponse.json(dbToReservation(result.data), { status: 201 });
}

export async function PATCH(req) {
  const {
    id, status, stripePaymentIntentId,
    paymentStatus, stripeCustomerId, stripePaymentMethodId, chargeAt,
  } = await req.json();
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  if (!supabaseAdmin) {
    try {
      const list = await getReservations();
      const current = list.find(r => String(r.id) === String(id));
      if (!current) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
      const saved = await saveReservation({ ...current, status, stripePaymentIntentId, paymentStatus, stripeCustomerId, stripePaymentMethodId, chargeAt });
      const savedRow = Array.isArray(saved)
        ? saved.find(r => String(r.id) === String(id))
        : saved;
      return NextResponse.json(savedRow ?? { ...current, status, stripePaymentIntentId });
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  }

  const updates = { status };
  if (stripePaymentIntentId) {
    updates.stripe_payment_intent_id = stripePaymentIntentId;
    const paidAmount = await loadStripePaidAmount(stripePaymentIntentId);
    if (paidAmount !== null) updates.stripe_paid_amount = paidAmount;
  }
  // Deferred-charge (card-on-file) fields
  if (paymentStatus !== undefined)        updates.payment_status           = paymentStatus;
  if (stripeCustomerId !== undefined)     updates.stripe_customer_id       = stripeCustomerId;
  if (stripePaymentMethodId !== undefined) updates.stripe_payment_method_id = stripePaymentMethodId;
  if (chargeAt !== undefined)             updates.charge_at                = chargeAt;

  const { data, error } = await supabaseAdmin
    .from('reservations').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let saved = data;
  if (
    ['confirmed', 'pending_assignment'].includes(saved.status)
    && stripePaymentIntentId
    && !saved.confirmation_email_sent_at
  ) {
    try {
      await sendReservationConfirmationEmail(saved);
      const stamp = new Date().toISOString();
      const { data: emailed } = await supabaseAdmin
        .from('reservations')
        .update({ confirmation_email_sent_at: stamp })
        .eq('id', id)
        .select()
        .single();
      if (emailed) saved = emailed;
    } catch (emailError) {
      console.warn('[reservations] confirmation email failed:', emailError.message);
    }
  }
  await notifyOwnerReservation(saved, { phase: 'finalize' });
  return NextResponse.json(dbToReservation(saved));
}

function dbToReservation(r) {
  return {
    id:                     r.id,
    vehicleId:              r.vehicle_id,
    ownerId:                r.owner_id,
    userId:                 r.user_id,
    pickup:                 r.pickup_at,
    ret:                    r.return_at,
    days:                   r.days,
    total:                  r.total,
    stripePaidAmount:       r.stripe_paid_amount,
    stripeCustomerId:       r.stripe_customer_id,
    stripePaymentMethodId:  r.stripe_payment_method_id,
    chargeAt:               r.charge_at,
    paymentStatus:          r.payment_status,
    confirmationEmailSentAt: r.confirmation_email_sent_at,
    status:                 r.status,
    type:                   r.type,
    opts:                   r.opts ?? {},
    pickupLoc:              r.pickup_loc,
    retLoc:                 r.return_loc,
    reviewDeadline:         r.review_deadline,
    payoutEnabled:          r.payout_enabled,
    stripePaymentIntentId:  r.stripe_payment_intent_id,
    guestName:              r.guest_name,
    guestEmail:             r.guest_email,
    guestPhone:             r.guest_phone,
    guestBookingToken:      r.guest_booking_token,
    contactHandles:         r.contact_handles ?? {},
    idpFileName:            r.idp_file_name,
    idpExpiresOn:           r.idp_expires_on,
    drivePassId:            r.drive_pass_id,
    oneWayLocationId:       r.one_way_location_id,
    oneWayFee:              r.one_way_fee,
    bookingType:            r.booking_type ?? BOOKING_TYPES.SPECIFIC,
    targetClass:            r.target_class,
    assignmentStatus:       r.assignment_status ?? (r.vehicle_id ? ASSIGNMENT_STATUS.ASSIGNED : ASSIGNMENT_STATUS.PENDING_ASSIGNMENT),
    assignedAt:             r.assigned_at,
    assignedBy:             r.assigned_by,
  };
}

function reservationToDbRow(r) {
  return {
    id:                        r.id,
    vehicle_id:                r.vehicleId ?? null,
    owner_id:                  r.ownerId ?? null,
    user_id:                   r.userId ?? null,
    pickup_at:                 r.pickup ?? null,
    return_at:                 r.ret ?? null,
    days:                      r.days ?? 1,
    total:                     r.total ?? 0,
    stripe_paid_amount:        r.stripePaidAmount ?? null,
    stripe_customer_id:        r.stripeCustomerId ?? null,
    stripe_payment_method_id:  r.stripePaymentMethodId ?? null,
    charge_at:                 r.chargeAt ?? null,
    payment_status:            r.paymentStatus ?? 'none',
    status:                    r.status ?? 'pending',
    type:                      r.type ?? 'corporate',
    opts:                      r.opts ?? {},
    pickup_loc:                r.pickupLoc ?? null,
    return_loc:                r.retLoc ?? null,
    review_deadline:           r.reviewDeadline ?? null,
    payout_enabled:            r.payoutEnabled ?? false,
    stripe_payment_intent_id:  r.stripePaymentIntentId ?? null,
    guest_name:                r.guestName ?? null,
    guest_email:               r.guestEmail ?? null,
    guest_phone:               r.guestPhone ?? null,
    guest_booking_token:       r.guestBookingToken ?? null,
    contact_handles:           r.contactHandles ?? {},
    idp_file_name:             r.idpFileName ?? null,
    idp_expires_on:            r.idpExpiresOn ?? null,
    drive_pass_id:             r.drivePassId ?? null,
    one_way_location_id:       r.oneWayLocationId ?? null,
    one_way_fee:               r.oneWayFee ?? 0,
    booking_type:              r.bookingType ?? BOOKING_TYPES.SPECIFIC,
    target_class:              normalizeVehicleClass(r.targetClass),
    assignment_status:         r.assignmentStatus ?? ASSIGNMENT_STATUS.ASSIGNED,
  };
}
