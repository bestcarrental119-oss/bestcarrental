/**
 * Owner payout (振込申請) requests.
 *
 *   GET  /api/owners/payouts?ownerId=xxx        → an owner's own requests
 *   GET  /api/owners/payouts?all=1[&status=..]  → admin: all requests (+owner info)
 *   POST /api/owners/payouts                     → owner submits a payout request
 *   PATCH /api/owners/payouts                     → admin updates a request's status
 *
 * Access is via the Supabase service role (bypasses RLS). Bank details are
 * snapshotted onto the request row at creation time.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'paid', 'rejected'];
// A request still counts against the balance unless it was rejected.
const ACTIVE_STATUSES = ['pending', 'approved', 'paid'];

function notConfigured() {
  return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
}

export async function GET(req) {
  if (!supabaseAdmin) return notConfigured();

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  const all = searchParams.get('all');
  const status = searchParams.get('status');

  try {
    if (all) {
      let query = supabaseAdmin
        .from('payout_requests')
        .select('*, owner:owners(id, store_name, owner_code, email, phone, platform_fee_percent)')
        .order('created_at', { ascending: false });
      if (status && STATUSES.includes(status)) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      const pendingCount = (data ?? []).filter(r => r.status === 'pending').length;
      return NextResponse.json({ payouts: data ?? [], pendingCount });
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'ownerId or all required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('payout_requests')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Amount already tied up in non-rejected requests, so the client can show a
    // correct available balance without trusting its own math alone.
    const reserved = (data ?? [])
      .filter(r => ACTIVE_STATUSES.includes(r.status))
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    return NextResponse.json({ payouts: data ?? [], reserved });
  } catch (e) {
    console.error('[api/owners/payouts GET] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!supabaseAdmin) return notConfigured();

  try {
    const body = await req.json();
    const ownerId = body.ownerId;
    const amount = Number(body.amount);
    const note = body.note ? String(body.note).slice(0, 1000) : null;
    const requestedBy = body.requestedBy || null;
    const availableSnapshot = body.availableSnapshot != null ? Number(body.availableSnapshot) : null;

    if (!ownerId) {
      return NextResponse.json({ error: 'ownerId required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'invalid amount', code: 'INVALID_AMOUNT' }, { status: 400 });
    }

    // Load the owner to snapshot bank info and confirm eligibility.
    const { data: owner, error: ownerErr } = await supabaseAdmin
      .from('owners')
      .select('*')
      .eq('id', ownerId)
      .single();
    if (ownerErr || !owner) {
      return NextResponse.json({ error: 'owner not found' }, { status: 404 });
    }
    if (owner.status !== 'approved') {
      return NextResponse.json({ error: 'owner not approved', code: 'NOT_APPROVED' }, { status: 403 });
    }

    // Requirement: guide the owner to register bank details if missing.
    const hasBank = Boolean(owner.bank_account_number && owner.bank_name);
    if (!hasBank) {
      return NextResponse.json({ error: 'no bank account on file', code: 'NO_BANK' }, { status: 400 });
    }

    // One open request at a time keeps the admin queue clean and prevents
    // accidental double submissions.
    const { data: existingPending } = await supabaseAdmin
      .from('payout_requests')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('status', 'pending')
      .limit(1);
    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ error: 'a pending request already exists', code: 'EXISTING_PENDING' }, { status: 409 });
    }

    // The client sends the balance it computed (revenue − fee − reserved).
    // Reject amounts above it as a server-side guard; the admin still verifies.
    if (availableSnapshot != null && Number.isFinite(availableSnapshot) && amount > availableSnapshot + 0.5) {
      return NextResponse.json({ error: 'amount exceeds available balance', code: 'EXCEEDS' }, { status: 400 });
    }

    const row = {
      owner_id: ownerId,
      amount,
      status: 'pending',
      note,
      requested_by: requestedBy,
      bank_name: owner.bank_name ?? null,
      bank_branch: owner.bank_branch ?? null,
      bank_account_type: owner.bank_account_type ?? null,
      bank_account_number: owner.bank_account_number ?? null,
      bank_account_holder: owner.bank_account_holder ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('payout_requests')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, payout: data }, { status: 201 });
  } catch (e) {
    console.error('[api/owners/payouts POST] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  if (!supabaseAdmin) return notConfigured();

  try {
    const { id, status, adminNote } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (!status || !STATUSES.includes(status)) {
      return NextResponse.json({ error: 'valid status required' }, { status: 400 });
    }

    const updates = { status };
    if (adminNote !== undefined) updates.admin_note = String(adminNote ?? '').slice(0, 1000) || null;
    updates.processed_at = status === 'pending' ? null : new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('payout_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, payout: data });
  } catch (e) {
    console.error('[api/owners/payouts PATCH] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
