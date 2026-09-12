/**
 * GET /api/owners/me?userId=xxx
 * user_id と email で検索し、承認済み申請を優先して返す。
 * includeAll=1 の場合は同じログインに紐づく全店舗も返す。
 * 見つかった店舗は user_id を自動更新する。
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isMasterDeletedOwner, withoutMasterDeletedOwners } from '../../../../lib/ownerVisibility';
export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function ownerVisibleInOwnerBackend(owner) {
  return Boolean(owner)
    && String(owner?.status ?? '').toLowerCase() !== 'rejected'
    && !isMasterDeletedOwner(owner);
}

function uniqueOwners(owners) {
  const seen = new Set();
  return (owners ?? []).filter(owner => {
    if (!owner?.id || seen.has(owner.id)) return false;
    seen.add(owner.id);
    return true;
  });
}

function visibleOwnerRows(owners) {
  return uniqueOwners(withoutMasterDeletedOwners(owners)).filter(ownerVisibleInOwnerBackend);
}

function choosePrimaryOwner(owners) {
  const list = visibleOwnerRows(owners);
  return list.find(owner => owner.status === 'approved' && owner.business_type !== 'additional_store')
    ?? list.find(owner => owner.status === 'approved')
    ?? list.find(owner => owner.status === 'pending' && owner.business_type !== 'additional_store')
    ?? list.find(owner => owner.status === 'pending')
    ?? list[0]
    ?? null;
}

async function assignOwnersToUser(owners, userId) {
  const list = visibleOwnerRows(owners);
  const updateIds = list
    .filter(owner => owner?.id && (!owner.user_id || owner.user_id !== userId))
    .map(owner => owner.id);

  if (updateIds.length > 0) {
    await supabaseAdmin
      .from('owners')
      .update({ user_id: userId })
      .in('id', updateIds);
  }

  return list.map(owner => (
    updateIds.includes(owner.id) ? { ...owner, user_id: userId } : owner
  ));
}

async function findOwnerByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const { data } = await supabaseAdmin
    .from('owners')
    .select('*')
    .ilike('email', normalizedEmail)
    .order('created_at', { ascending: false });

  if (data?.length) return data;

  const { data: fuzzyData } = await supabaseAdmin
    .from('owners')
    .select('*')
    .ilike('email', `%${normalizedEmail}%`)
    .order('created_at', { ascending: false });

  return (fuzzyData ?? []).filter(owner => normalizeEmail(owner.email) === normalizedEmail);
}

async function findOwnerByUserId(userId) {
  const { data } = await supabaseAdmin
    .from('owners')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data ?? [];
}

async function findOwnersByIds(ownerIds) {
  const ids = [...new Set((ownerIds ?? []).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from('owners')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: false });

  return data ?? [];
}

async function findOwnersByParentIds(ownerIds) {
  const ids = [...new Set((ownerIds ?? []).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from('owners')
    .select('*')
    .in('parent_owner_id', ids)
    .order('created_at', { ascending: false });

  return data ?? [];
}

async function findOwnersByRelatedKeys(owners) {
  const ownerUserIds = new Set((owners ?? []).map(owner => owner?.user_id).filter(Boolean).map(String));
  const parentOwnerIds = new Set((owners ?? [])
    .flatMap(owner => [owner?.id, owner?.parent_owner_id])
    .filter(Boolean)
    .map(String));
  if (ownerUserIds.size === 0 && parentOwnerIds.size === 0) return [];

  const { data } = await supabaseAdmin
    .from('owners')
    .select('*')
    .order('created_at', { ascending: false });

  return (data ?? []).filter(owner => (
    ownerUserIds.has(String(owner.user_id))
    || parentOwnerIds.has(String(owner.id))
    || parentOwnerIds.has(String(owner.parent_owner_id))
  ));
}

async function expandOwnerFamily(owners) {
  const initialOwners = uniqueOwners(owners);
  if (initialOwners.length === 0) return [];

  const parentOwners = await findOwnersByIds(initialOwners.map(owner => owner.parent_owner_id));
  const rootOwners = uniqueOwners([...initialOwners, ...parentOwners]);
  const childOwners = await findOwnersByParentIds(rootOwners.map(owner => owner.id));
  const relatedOwners = await findOwnersByRelatedKeys([...rootOwners, ...childOwners]);
  const relatedParentOwners = await findOwnersByIds(relatedOwners.map(owner => owner.parent_owner_id));

  return uniqueOwners([...rootOwners, ...childOwners, ...relatedOwners, ...relatedParentOwners]);
}

async function findOwnerForLogin(userId, emails) {
  const emailList = [...new Set((Array.isArray(emails) ? emails : [emails]).map(normalizeEmail).filter(Boolean))];
  const [byUserId, ...byEmailLists] = await Promise.all([
    findOwnerByUserId(userId),
    ...emailList.map(email => findOwnerByEmail(email)),
  ]);
  const byEmail = byEmailLists.flat();
  const initialOwners = uniqueOwners([...byUserId, ...byEmail]);
  const ownerFamily = visibleOwnerRows(await expandOwnerFamily(initialOwners));

  const assignedOwners = await assignOwnersToUser(ownerFamily, userId);
  const primaryOwner = choosePrimaryOwner(assignedOwners);
  return { primaryOwner, assignedOwners };
}

export async function GET(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503, headers: NO_CACHE_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const includeAll = searchParams.get('includeAll') === '1';

  const fallbackEmail = normalizeEmail(searchParams.get('email'));
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const authEmail = normalizeEmail(authUser?.user?.email);

    const { primaryOwner, assignedOwners } = await findOwnerForLogin(userId, [authEmail, fallbackEmail]);
    if (primaryOwner) {
      if (includeAll) return NextResponse.json({ owner: primaryOwner, owners: assignedOwners }, { headers: NO_CACHE_HEADERS });
      return NextResponse.json(primaryOwner, { headers: NO_CACHE_HEADERS });
    }
  } catch (e) {
    console.warn('[owners/me] auth lookup failed:', e.message);
    const { primaryOwner, assignedOwners } = await findOwnerForLogin(userId, fallbackEmail);
    if (primaryOwner) {
      if (includeAll) return NextResponse.json({ owner: primaryOwner, owners: assignedOwners }, { headers: NO_CACHE_HEADERS });
      return NextResponse.json(primaryOwner, { headers: NO_CACHE_HEADERS });
    }
  }

  if (includeAll) return NextResponse.json({ owner: null, owners: [] }, { headers: NO_CACHE_HEADERS });
  return NextResponse.json(null, { headers: NO_CACHE_HEADERS });
}
