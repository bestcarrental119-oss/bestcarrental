/**
 * GET /api/chat/unread?userId=xxx&role=user|owner
 * 自分宛の未読メッセージ数を返す
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';

async function resolveOwnerLookupIds(ownerUserId) {
  if (!ownerUserId) return [];

  const { data } = await supabaseAdmin
    .from('owners')
    .select('id, user_id')
    .or(`id.eq.${ownerUserId},user_id.eq.${ownerUserId}`);

  const ids = [ownerUserId];
  for (const owner of data ?? []) {
    if (owner.id) ids.push(owner.id);
    if (owner.user_id) ids.push(owner.user_id);
  }
  return [...new Set(ids)];
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ count: 0 });
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const role   = searchParams.get('role') ?? 'user';
  if (!userId) return NextResponse.json({ count: 0 });

  // 自分の会話IDを取得
  let convQuery = supabaseAdmin
    .from('conversations')
    .select('id');

  if (role === 'owner') {
    const ownerLookupIds = await resolveOwnerLookupIds(userId);
    convQuery = convQuery.in('owner_user_id', ownerLookupIds);
  } else {
    convQuery = convQuery.eq('user_id', userId);
  }

  const { data: convs } = await convQuery;

  if (!convs?.length) return NextResponse.json({ count: 0 });

  const convIds = convs.map(c => c.id);

  // 相手が送った未読メッセージ数
  const { count } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', convIds)
    .eq('is_read', false)
    .neq('sender_id', userId);

  return NextResponse.json({ count: count ?? 0 });
}
