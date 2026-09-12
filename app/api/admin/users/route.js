/**
 * GET  /api/admin/users          → Supabase Auth ユーザー一覧（マスター専用）
 * POST /api/admin/users          → ユーザー追加 / パスワード変更 / リセットメール送信（マスター専用）
 * PATCH /api/admin/users         → 役割変更（マスター専用）
 * DELETE /api/admin/users        → アカウント＋関連データ削除（マスター専用）
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isMasterUser, isMasterEmail } from '../../../../lib/master';
import { sendPasswordResetLink } from '../../../../lib/passwordReset';
export const dynamic = 'force-dynamic';

const ROLES = ['user', 'owner', 'admin'];
const SENSITIVE_METADATA_KEY = /(password|passcode|secret|token|otp|recovery|session)/i;

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validRole(role) {
  return ROLES.includes(role);
}

function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function redactSensitiveMetadata(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_METADATA_KEY.test(key) ? '[hidden]' : redactSensitiveMetadata(item),
  ]));
}

function safeUser(u) {
  const userMetadata = u?.user_metadata ?? {};
  const appMetadata = u?.app_metadata ?? {};
  const role = userMetadata.role ?? appMetadata.role ?? 'user';
  return {
    id: u.id,
    email: u.email,
    name: userMetadata.name ?? u.email?.split('@')[0] ?? '—',
    role,
    emailConfirmed: !!u.email_confirmed_at,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at,
    confirmedAt: u.confirmed_at ?? u.email_confirmed_at ?? null,
    phone: u.phone ?? userMetadata.phone ?? userMetadata.bookingProfile?.phone ?? null,
    providers: (u.identities ?? []).map(identity => identity.provider).filter(Boolean),
    userMetadata: redactSensitiveMetadata(userMetadata),
    appMetadata: redactSensitiveMetadata(appMetadata),
    passwordReadable: false,
    passwordStatus: 'not_readable',
  };
}

// マスターは全権。管理者(admin)はマスター以外のユーザーの閲覧・編集が可能（削除は不可）。
async function assertMaster(requesterId) {
  if (!requesterId) return { ok: false, status: 401, error: 'requesterId required' };
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(requesterId);
  if (error || !data?.user) return { ok: false, status: 401, error: 'requester not found' };
  if (isMasterUser(data.user)) return { ok: true, level: 'master' };
  const role = data.user.user_metadata?.role ?? data.user.app_metadata?.role ?? 'user';
  if (role === 'admin') return { ok: true, level: 'admin' };
  return { ok: false, status: 403, error: 'admin only' };
}

// 管理者は対象がマスターアカウントなら操作不可（マスター保護）。
async function blockIfTargetMaster(level, { userId, email } = {}) {
  if (level === 'master') return null;
  if (email && isMasterEmail(email)) {
    return { status: 403, error: 'admin cannot modify the master account' };
  }
  if (userId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (data?.user && isMasterUser(data.user)) {
      return { status: 403, error: 'admin cannot modify the master account' };
    }
  }
  return null;
}

// テーブルが存在しない/カラム違いでも全体を止めないための安全実行。
async function tryDelete(label, fn, log) {
  try { await fn(); log.push(label); }
  catch (e) { log.push(`${label}:skip(${e.message?.slice(0, 60)})`); }
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const requesterId = searchParams.get('requesterId');
  const guard = await assertMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    // Supabase Auth の全ユーザーを取得
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const users = (data.users ?? []).map(safeUser);

    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const {
    requesterId,
    action,
    userId,
    name,
    phone,
    role = 'user',
    password,
  } = body || {};
  const email = normalizeEmail(body?.email);

  const guard = await assertMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  {
    const blocked = await blockIfTargetMaster(guard.level, { userId, email });
    if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });
  }

  if (action === 'reset_password') {
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
    const result = await sendPasswordResetLink({
      email,
      requestOrigin: new URL(req.url).origin,
    });
    if (!result.ok) {
      return NextResponse.json({
        error: result.error,
        retryAfter: result.retryAfter,
      }, { status: result.status ?? 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'create_user') {
    if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });
    if (!validRole(role)) return NextResponse.json({ error: 'invalid role' }, { status: 400 });

    const userMetadata = {
      name: cleanText(name) || email.split('@')[0],
      phone: cleanText(phone, 40),
      role,
      bookingProfile: cleanText(phone, 40) ? { phone: cleanText(phone, 40) } : {},
    };
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, user: safeUser(data.user) }, { status: 201 });
  }

  if (action === 'set_password') {
    if (!userId || !password) return NextResponse.json({ error: 'userId and password required' }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: String(password) });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, user: safeUser(data.user) });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { requesterId, userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
  if (!validRole(role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }

  // 役割の割当はマスター専用。
  const guard = await assertMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  {
    const blocked = await blockIfTargetMaster(guard.level, { userId });
    if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });
  }

  // 既存の user_metadata を保持したまま role だけ更新する。
  const { data: current } = await supabaseAdmin.auth.admin.getUserById(userId);
  const meta = { ...(current?.user?.user_metadata ?? {}), role };

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: meta,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: safeUser(data.user) });
}

/**
 * アカウントと関連データを完全に削除する（規約違反・オーナー・ダミー整理用）。
 * 呼び出し元は master アカウントであることを検証する。対象ユーザーが借り手として
 * 持つ予約・レビューに加え、オーナーの場合は車両・拠点・出品も削除する。
 */
export async function DELETE(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { requesterId, userId } = body || {};
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (String(requesterId) === String(userId)) {
    return NextResponse.json({ error: '自分自身のアカウントは削除できません。' }, { status: 400 });
  }

  const guard = await assertMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (guard.level !== 'master') {
    return NextResponse.json({ error: 'master only (delete is master-only)' }, { status: 403 });
  }

  const log = [];
  const db = supabaseAdmin;

  // 1) 対象ユーザーが所有するオーナー行を特定（車両などの親）。
  let ownerIds = [];
  try {
    const { data: owners } = await db.from('owners').select('id').eq('user_id', userId);
    ownerIds = (owners ?? []).map(o => o.id);
  } catch { /* owners テーブルが無い環境は無視 */ }

  const idSet = [userId, ...ownerIds];

  // 2) レビュー（借り手/ホスト双方向）
  await tryDelete('reviews.reviewer', () => db.from('reviews').delete().in('reviewer_id', idSet).then(r => { if (r.error) throw r.error; }), log);
  await tryDelete('reviews.reviewee', () => db.from('reviews').delete().in('reviewee_id', idSet).then(r => { if (r.error) throw r.error; }), log);

  // 3) 予約（借り手として / オーナーとして）
  await tryDelete('reservations.user', () => db.from('reservations').delete().eq('user_id', userId).then(r => { if (r.error) throw r.error; }), log);
  if (ownerIds.length) {
    await tryDelete('reservations.owner', () => db.from('reservations').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
  }

  // 4) オーナー資産（車両・拠点・片道出品・受渡記録）
  if (ownerIds.length) {
    await tryDelete('one_way_listings', () => db.from('one_way_listings').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
    await tryDelete('owner_pickup_records', () => db.from('owner_pickup_records').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
    await tryDelete('owner_locations', () => db.from('owner_locations').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
    await tryDelete('store_addons', () => db.from('store_addons').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
    await tryDelete('vehicles', () => db.from('vehicles').delete().in('owner_id', ownerIds).then(r => { if (r.error) throw r.error; }), log);
  }

  // 5) チャット（会話・メッセージ）— 借り手/オーナーの両参加パターン
  await tryDelete('conversations.user', () => db.from('conversations').delete().eq('user_id', userId).then(r => { if (r.error) throw r.error; }), log);
  await tryDelete('conversations.owner', () => db.from('conversations').delete().eq('owner_user_id', userId).then(r => { if (r.error) throw r.error; }), log);

  // 6) オーナー行そのもの
  if (ownerIds.length) {
    await tryDelete('owners', () => db.from('owners').delete().eq('user_id', userId).then(r => { if (r.error) throw r.error; }), log);
  }

  // 7) 認証アカウント本体
  const { error: delErr } = await db.auth.admin.deleteUser(userId);
  if (delErr) return NextResponse.json({ error: `auth削除に失敗: ${delErr.message}`, log }, { status: 500 });
  log.push('auth.user');

  return NextResponse.json({ success: true, deleted: userId, ownerIds, log });
}