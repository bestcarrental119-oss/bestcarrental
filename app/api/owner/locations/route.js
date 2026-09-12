/**
 * /api/owner/locations — オーナーの拠点住所（Best Match 用）
 *   GET    ?ownerId=&ownerAuthId=  → その オーナーの拠点一覧
 *   POST   { ownerId, ownerAuthId, label, address, lat, lng }
 *   DELETE ?id=
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const toLoc = r => ({
  id: r.id, label: r.label ?? '', address: r.address,
  lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
});

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ locations: [] });
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  const ownerAuthId = searchParams.get('ownerAuthId');
  if (!ownerId && !ownerAuthId) return NextResponse.json({ locations: [] });

  const ors = [];
  if (ownerId) ors.push(`owner_id.eq.${ownerId}`);
  if (ownerAuthId) ors.push(`owner_auth_id.eq.${ownerAuthId}`);

  const { data, error } = await supabaseAdmin
    .from('owner_locations').select('*').or(ors.join(',')).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: (data ?? []).map(toLoc) });
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const b = await req.json();
    if (!b.address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('owner_locations').insert({
      owner_id: b.ownerId ?? null,
      owner_auth_id: b.ownerAuthId ?? null,
      label: b.label ?? null,
      address: b.address.trim(),
      lat: b.lat ?? null,
      lng: b.lng ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ location: toLoc(data) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('owner_locations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
