/**
 * POST /api/owners
 * 新規オーナー登録
 * multipart/form-data でテキスト＋ファイルを受け取り、
 * Supabase Storage にアップロード後、owners テーブルに保存する。
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { isMasterUser } from '../../../lib/master';
import { isMasterDeletedOwner } from '../../../lib/ownerVisibility';

export const dynamic = 'force-dynamic';

const BUCKET = 'owner-docs';
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeOwnerCode() {
  return `OWN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function defaultPublicStoreName(location) {
  const label = cleanText(location, 40).replace(/(店|店舗)$/u, '') || '未設定';
  return `Best Car Rental ${label}店`;
}

function cleanUuid(value) {
  return UUID_RE.test(String(value ?? '')) ? String(value) : null;
}

function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

async function assertMaster(req, requesterId) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'token required' };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'requester not found' };

  const cleanRequesterId = cleanUuid(requesterId);
  if (cleanRequesterId && cleanRequesterId !== data.user.id) {
    return { ok: false, status: 403, error: 'requester mismatch' };
  }

  if (!isMasterUser(data.user)) return { ok: false, status: 403, error: 'master only' };
  return { ok: true, user: data.user };
}

async function tryMutation(label, fn, log) {
  try {
    const result = await fn();
    if (result?.error) throw result.error;
    log.push(label);
  } catch (e) {
    log.push(`${label}:skip(${e.message?.slice(0, 60)})`);
  }
}

async function resolveOwnerUserId({ businessType, parentOwnerId, userId }) {
  const cleanUserId = cleanUuid(userId);
  if (businessType !== 'additional_store') return cleanUserId;
  const cleanParentOwnerId = cleanUuid(parentOwnerId);
  if (!cleanParentOwnerId) return cleanUserId;

  const { data } = await supabaseAdmin
    .from('owners')
    .select('user_id')
    .eq('id', cleanParentOwnerId)
    .maybeSingle();

  return data?.user_id ?? cleanUserId;
}

async function findPrimaryOwnerForUser(owner) {
  if (!owner?.user_id) return null;

  const { data, error } = await supabaseAdmin
    .from('owners')
    .select('id, user_id')
    .eq('user_id', owner.user_id)
    .neq('business_type', 'additional_store')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function linkApprovedAdditionalStoreToOwnerAccount(id, updates) {
  if (updates.status !== 'approved') return updates;

  const cleanOwnerId = cleanUuid(id);
  if (!cleanOwnerId) return updates;

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from('owners')
    .select('id, business_type, parent_owner_id, user_id')
    .eq('id', cleanOwnerId)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (owner?.business_type !== 'additional_store') return updates;

  let parent = null;
  if (owner.parent_owner_id) {
    const { data, error } = await supabaseAdmin
      .from('owners')
      .select('id, user_id')
      .eq('id', owner.parent_owner_id)
      .maybeSingle();
    if (error) throw error;
    parent = data ?? null;
  } else {
    const primaryOwner = await findPrimaryOwnerForUser(owner);
    if (!primaryOwner) return updates;
    parent = primaryOwner;
  }

  const linked = { ...updates };
  if (!owner.parent_owner_id && parent?.id) linked.parent_owner_id = parent?.id;
  if (parent?.user_id && parent.user_id !== owner.user_id) linked.user_id = parent?.user_id;

  return linked;
}

// ── ファイルを Supabase Storage にアップロードしてURLを返す ──
async function uploadFile(file, folder) {
  if (!file || file.size === 0) return null;

  const ext  = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buf  = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  return signed?.signedUrl ?? path;
}

export async function POST(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const form = await req.formData();

    const businessType = form.get('businessType');

    const [idDocUrl, corpRegistryUrl, rentalPermitUrl] = await Promise.all([
      uploadFile(form.get('idDocument'),   'id-docs'),
      uploadFile(form.get('corpRegistry'), 'corp-registry'),
      uploadFile(form.get('rentalPermit'), 'rental-permits'),
    ]);

    const rawUserId = form.get('userId');
    const rawParentOwnerId = form.get('parentOwnerId');
    const userId = await resolveOwnerUserId({
      businessType,
      parentOwnerId: rawParentOwnerId,
      userId: rawUserId,
    });

    const row = {
      applicant_name:      form.get('applicantName') || form.get('storeName'),
      store_name:          form.get('displayStoreName') || defaultPublicStoreName(form.get('storeLocation')),
      store_location:      form.get('storeLocation'),
      phone:               form.get('phone'),
      email:               form.get('email'),
      business_type:       businessType,
      parent_owner_id:     businessType === 'additional_store' ? cleanUuid(rawParentOwnerId) : null,
      owner_code:          makeOwnerCode(),
      booking_email_contact: form.get('bookingEmailContact') || null,
      pre_booking_chat_enabled: false,
      platform_fee_percent: 15,

      id_document_url:     businessType === 'individual' ? idDocUrl : null,

      corp_address:        businessType === 'corporation' ? form.get('corpAddress') : null,
      corp_registry_url:   businessType === 'corporation' ? corpRegistryUrl : null,

      rental_permit_url:   rentalPermitUrl,
      invoice_number:      form.get('invoiceNumber') || null,

      bank_name:           form.get('bankName')          || null,
      bank_branch:         form.get('bankBranch')        || null,
      bank_account_type:   form.get('bankAccountType')   || null,
      bank_account_number: form.get('bankAccountNumber') || null,
      bank_account_holder: form.get('bankAccountHolder') || null,

      status: 'pending',
      user_id: userId,
    };

    const { data, error } = await supabaseAdmin
      .from('owners')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, owner: data }, { status: 201 });

  } catch (e) {
    console.error('[api/owners] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── GET /api/owners — 管理者用一覧取得 ───────────────────────
export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from('owners')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).filter(owner => !isMasterDeletedOwner(owner)), { headers: NO_CACHE_HEADERS });
}

// ── DELETE /api/owners — マスター専用: 追加店舗をオーナー画面から外す ──
export async function DELETE(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const requesterId = body?.requesterId;
  const id = cleanUuid(body?.id ?? body?.ownerId);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const guard = await assertMaster(req, requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from('owners')
    .select('id, business_type, parent_owner_id, store_name, status')
    .eq('id', id)
    .maybeSingle();
  if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
  if (!owner) return NextResponse.json({ error: 'owner not found' }, { status: 404 });
  if (owner.business_type !== 'additional_store') {
    return NextResponse.json({ error: '追加店舗だけ削除できます。親店舗や通常オーナー申請は削除できません。' }, { status: 400 });
  }

  const log = [];
  const now = new Date().toISOString();
  const deletionNote = `Deleted by master at ${now}`;

  await tryMutation('vehicles.disabled', () => supabaseAdmin
    .from('vehicles')
    .update({ status: 'inactive', approval_status: 'rejected' })
    .eq('owner_id', id), log);
  await tryMutation('owner_locations.deleted', () => supabaseAdmin.from('owner_locations').delete().eq('owner_id', id), log);
  await tryMutation('owner_pickup_records.deleted', () => supabaseAdmin.from('owner_pickup_records').delete().eq('owner_id', id), log);
  await tryMutation('store_addons.deleted', () => supabaseAdmin.from('store_addons').delete().eq('owner_id', id), log);
  await tryMutation('one_way_listings.deleted', () => supabaseAdmin.from('one_way_listings').delete().eq('owner_id', id), log);

  const { data, error } = await supabaseAdmin
    .from('owners')
    .update({ status: 'rejected', rejection_reason: deletionNote })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message, log }, { status: 500 });

  log.push('owners.rejected');
  return NextResponse.json({ success: true, owner: data, deletedMode: 'disabled', log }, { headers: NO_CACHE_HEADERS });
}

// ── PATCH /api/owners — 審査ステータス更新（管理者用）────────
export async function PATCH(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    id,
    status,
    rejectionReason,
    bookingEmailContact,
    platformFeePercent,
    preauthMode,
    preBookingChatEnabled,
    pre_booking_chat_enabled,
    storeName,
    bankName,
    bankBranch,
    bankAccountType,
    bankAccountNumber,
    bankAccountHolder,
  } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const updates = {};
  if (status) updates.status = status;
  if (rejectionReason) updates.rejection_reason = rejectionReason;
  if (storeName !== undefined) {
    const nextStoreName = cleanText(storeName);
    if (!nextStoreName) return NextResponse.json({ error: 'storeName required' }, { status: 400 });
    updates.store_name = nextStoreName;
  }
  if (bookingEmailContact !== undefined) updates.booking_email_contact = String(bookingEmailContact).slice(0, 2000);
  if (preauthMode !== undefined) updates.preauth_mode = preauthMode === 'one' ? 'one' : 'zero';
  // Owner-editable payout bank account (registered later from the owner backend).
  // Empty string clears the field. Kept short to avoid runaway payloads.
  const bankFieldMap = {
    bankName: 'bank_name',
    bankBranch: 'bank_branch',
    bankAccountType: 'bank_account_type',
    bankAccountNumber: 'bank_account_number',
    bankAccountHolder: 'bank_account_holder',
  };
  const bankInputs = { bankName, bankBranch, bankAccountType, bankAccountNumber, bankAccountHolder };
  for (const [key, column] of Object.entries(bankFieldMap)) {
    if (bankInputs[key] !== undefined) {
      const v = String(bankInputs[key] ?? '').slice(0, 200).trim();
      updates[column] = v === '' ? null : v;
    }
  }
  if (preBookingChatEnabled !== undefined || pre_booking_chat_enabled !== undefined) {
    updates.pre_booking_chat_enabled = Boolean(preBookingChatEnabled ?? pre_booking_chat_enabled);
  }
  if (platformFeePercent !== undefined) {
    const fee = Number(platformFeePercent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 80) {
      return NextResponse.json({ error: 'platformFeePercent must be between 0 and 80' }, { status: 400 });
    }
    updates.platform_fee_percent = fee;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  const linkedUpdates = await linkApprovedAdditionalStoreToOwnerAccount(id, updates);

  const { data, error } = await supabaseAdmin
    .from('owners')
    .update(linkedUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
}
