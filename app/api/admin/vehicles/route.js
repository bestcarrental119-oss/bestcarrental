/**
 * GET  /api/admin/vehicles?status=pending  → 審査待ち車両一覧
 * GET  /api/admin/vehicles?status=all      → 全車両
 * PATCH /api/admin/vehicles  { id, approvalStatus, approvalNote } → 承認/却下
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';

  let q = supabaseAdmin.from('vehicles').select('*').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('approval_status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id, approvalStatus, approvalNote } = await req.json();
  if (!id || !approvalStatus) return NextResponse.json({ error: 'id and approvalStatus required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .update({ approval_status: approvalStatus, approval_note: approvalNote ?? null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
