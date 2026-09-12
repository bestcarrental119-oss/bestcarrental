import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isMasterUser } from '../../../../lib/master';

export const dynamic = 'force-dynamic';

// 管理者(admin) または マスター のみ許可。
async function assertAdminOrMaster(requesterId) {
  if (!requesterId) return { ok: false, status: 401, error: 'requesterId required' };
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(requesterId);
  if (error || !data?.user) return { ok: false, status: 401, error: 'requester not found' };
  if (isMasterUser(data.user)) return { ok: true, user: data.user, level: 'master' };
  const role = data.user.user_metadata?.role ?? data.user.app_metadata?.role ?? 'user';
  if (role === 'admin') return { ok: true, user: data.user, level: 'admin' };
  return { ok: false, status: 403, error: 'admin only' };
}

// GET /api/admin/announcements?requesterId=...  → お知らせ一覧（新しい順）
export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const requesterId = new URL(req.url).searchParams.get('requesterId');
  const guard = await assertAdminOrMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabaseAdmin
    .from('owner_announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/announcements
//   作成: { requesterId, title, body }
//   停止: { requesterId, action: 'deactivate', id }
export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  let payload;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { requesterId, title, body, action, id } = payload || {};

  const guard = await assertAdminOrMaster(requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  if (action === 'deactivate') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await supabaseAdmin
      .from('owner_announcements')
      .update({ active: false })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const text = String(body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('owner_announcements')
    .insert({
      title: String(title ?? '').trim().slice(0, 200) || null,
      body: text.slice(0, 5000),
      created_by: guard.user.id,
      created_by_email: guard.user.email ?? null,
      active: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, announcement: data }, { status: 201 });
}
