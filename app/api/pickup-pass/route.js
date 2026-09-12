/**
 * Digital IDP pickup pass.
 *
 * POST /api/pickup-pass
 *   Body: { reservationId, userId, snapshot }
 *   The renter generates (or refreshes) a pickup pass for their reservation.
 *   `snapshot` is a JSON object with their IDP / licence / passport details and
 *   photos (data URLs), plus nationality and name. We store it on the
 *   reservation and return an opaque token to encode in the QR.
 *   Only the reservation owner (user_id) may generate a pass, and only while the
 *   booking is still an active reservation flow.
 *
 * GET /api/pickup-pass?token=XXXX
 *   Returns a lightweight status for the token (used by the renter UI to show
 *   whether the pass has been scanned yet). Does NOT return personal data — the
 *   owner-side save endpoint is the only path that reveals the snapshot.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { uploadDataUrl, parseDataUrl, extFor, BUCKET_IDP } from '../../../lib/storage';
import { AUTHORIZED_PAYMENT_STATUS } from '../../../lib/paymentAuthorization';

function makeToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BCR-${out}`;
}

const PASS_ELIGIBLE_STATUSES = new Set([
  'payment_pending',
  'pending',
  'confirmed',
  'paid',
  'pending_assignment',
  'in_progress',
]);
const PASS_ELIGIBLE_PAYMENT_STATUSES = new Set(['paid', 'scheduled', AUTHORIZED_PAYMENT_STATUS]);

export async function POST(req) {
  try {
    const { reservationId, userId, snapshot } = await req.json();
    if (!reservationId || !userId) {
      return NextResponse.json({ error: 'reservationId and userId are required' }, { status: 400 });
    }
    if (!supabaseAdmin) {
      // Demo mode: return a deterministic token so the UI still works.
      return NextResponse.json({ token: `DEMO-${String(reservationId).slice(-6).toUpperCase()}`, demo: true });
    }

    const { data: r, error } = await supabaseAdmin
      .from('reservations')
      .select('id, user_id, status, payment_status, pickup_token')
      .eq('id', reservationId)
      .single();

    if (error || !r) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    if (String(r.user_id) !== String(userId)) {
      return NextResponse.json({ error: 'Not your reservation' }, { status: 403 });
    }
    const canCreatePass = PASS_ELIGIBLE_STATUSES.has(String(r.status ?? '').toLowerCase())
      || PASS_ELIGIBLE_PAYMENT_STATUSES.has(String(r.payment_status ?? '').toLowerCase());
    if (!canCreatePass) {
      return NextResponse.json({ error: 'Pass is not available for this reservation status.' }, { status: 409 });
    }

    const token = r.pickup_token || makeToken();

    // Move IDP / licence / passport images out of the DB into Storage — the
    // snapshot keeps only the storage path (tiny), not the base64 bytes.
    let snap = snapshot ?? {};
    if (snap.documents && typeof snap.documents === 'object') {
      const docs = {};
      for (const [key, val] of Object.entries(snap.documents)) {
        if (val?.dataUrl) {
          const parsed = parseDataUrl(val.dataUrl);
          const ext = parsed ? extFor(parsed.contentType) : 'jpg';
          const path = `${userId}/${reservationId}/${key}.${ext}`;
          try {
            await uploadDataUrl(BUCKET_IDP, path, val.dataUrl);
            docs[key] = { path, expiry: val.expiry ?? null, fileName: val.fileName ?? null };
          } catch {
            docs[key] = { expiry: val.expiry ?? null }; // keep expiry even if upload failed
          }
        } else if (val?.path || val?.expiry) {
          docs[key] = { path: val.path ?? null, expiry: val.expiry ?? null, fileName: val.fileName ?? null };
        }
      }
      snap = { ...snap, documents: docs };
    }

    const { error: upErr } = await supabaseAdmin
      .from('reservations')
      .update({
        pickup_token: token,
        idp_snapshot: snap,
        pickup_pass_created_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ token });
  } catch (err) {
    console.error('[POST /api/pickup-pass]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json({ verified: false, demo: true });

    const { data: r } = await supabaseAdmin
      .from('reservations')
      .select('id, pickup_verified_at')
      .eq('pickup_token', token)
      .single();

    return NextResponse.json({ found: !!r, verified: !!r?.pickup_verified_at });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
