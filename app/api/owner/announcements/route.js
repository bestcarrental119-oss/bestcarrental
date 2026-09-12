import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/owner/announcements?requesterId=<オーナーの認証ユーザーID>
//   → { items: [{ id, title, body, created_at, read }], unread: number }
export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const requesterId = new URL(req.url).searchParams.get('requesterId');
  if (!requesterId) return NextResponse.json({ error: 'requesterId required' }, { status: 400 });

  const { data: anns, error } = await supabaseAdmin
    .from('owner_announcements')
    .select('id, title, body, created_at, created_by_email')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = anns ?? [];
  let readIds = new Set();
  if (list.length) {
    const { data: reads } = await supabaseAdmin
      .from('owner_announcement_reads')
      .select('announcement_id')
      .eq('user_id', requesterId)
      .in('announcement_id', list.map(a => a.id));
    readIds = new Set((reads ?? []).map(r => r.announcement_id));
  }

  const items = list.map(a => ({ ...a, read: readIds.has(a.id) }));
  const unread = items.filter(a => !a.read).length;
  return NextResponse.json({ items, unread });
}

// POST /api/owner/announcements
//   既読化: { requesterId, action: 'read', id? }   ← id省略で「表示中の全件」を既読
export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  let payload;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { requesterId, action, id } = payload || {};
  if (!requesterId) return NextResponse.json({ error: 'requesterId required' }, { status: 400 });
  if (action !== 'read') return NextResponse.json({ error: 'unknown action' }, { status: 400 });

  let ids = [];
  if (id) {
    ids = [id];
  } else {
    const { data: anns } = await supabaseAdmin
      .from('owner_announcements')
      .select('id')
      .eq('active', true)
      .limit(100);
    ids = (anns ?? []).map(a => a.id);
  }
  if (!ids.length) return NextResponse.json({ success: true, marked: 0 });

  const rows = ids.map(aid => ({ announcement_id: aid, user_id: requesterId }));
  const { error } = await supabaseAdmin
    .from('owner_announcement_reads')
    .upsert(rows, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, marked: ids.length });
}
