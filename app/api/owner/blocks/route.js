/**
 * Renter block list API — 加盟店オーナーが利用者をブロック/解除する
 *
 * GET    /api/owner/blocks?ownerId=xxx           — ブロック中の利用者一覧
 * POST   /api/owner/blocks  {ownerId,userId,reason}  — ブロック追加
 * DELETE /api/owner/blocks  {ownerId,userId}     — ブロック解除
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json([]);
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400 });

  // Join user name/email for display
  const { data, error } = await supabaseAdmin
    .from('renter_blocks')
    .select('*, users(name, email)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { ownerId, userId, reason } = await req.json();
  if (!ownerId || !userId) {
    return NextResponse.json({ error: 'ownerId and userId required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('renter_blocks')
    .upsert({ owner_id: ownerId, user_id: userId, reason: reason ?? null }, { onConflict: 'owner_id,user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { ownerId, userId } = await req.json();
  if (!ownerId || !userId) {
    return NextResponse.json({ error: 'ownerId and userId required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('renter_blocks')
    .delete()
    .eq('owner_id', ownerId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
