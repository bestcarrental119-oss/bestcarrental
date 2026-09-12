/**
 * GET  /api/addons?ownerId=xxx  → 加盟店＋共通アドオン一覧
 * POST /api/addons              → 新規作成
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');

  let query = supabaseAdmin.from('store_addons').select('*').eq('is_active', true).order('sort_order');

  if (ownerId) {
    query = supabaseAdmin
      .from('store_addons')
      .select('*')
      .eq('is_active', true)
      .or(`owner_id.eq.${ownerId},owner_id.is.null`)
      .order('sort_order');
  } else {
    query = query.is('owner_id', null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const { ownerId, name, description, icon, price, price_type, sort_order } = await req.json();
    if (!name || price == null) return NextResponse.json({ error: 'name and price are required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('store_addons')
      .insert({ owner_id: ownerId ?? null, name, description: description ?? null,
                icon: icon ?? '⚙️', price: Number(price), price_type: price_type ?? 'per_day',
                sort_order: sort_order ?? 0 })
      .select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
