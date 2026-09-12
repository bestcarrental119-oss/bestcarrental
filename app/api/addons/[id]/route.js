/**
 * PATCH  /api/addons/[id]  → アドオン更新
 * DELETE /api/addons/[id]  → アドオン削除
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export async function PATCH(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const body = await req.json();
    const { data, error } = await supabaseAdmin
      .from('store_addons')
      .update(body)
      .eq('id', params.id)
      .select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { error } = await supabaseAdmin.from('store_addons').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
