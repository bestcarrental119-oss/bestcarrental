/**
 * /api/inspection — 車両状態チェック（貸出前/返却後の写真）
 *   GET  ?reservationId=xxx        → 保存済みの写真・解析
 *   POST { reservationId, photos } → 写真セットを保存（upsert）
 *        { reservationId, analysis, estCost, mode } → 手動解析の保存
 */
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!supabaseAdmin) return Response.json({ inspection: null });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('reservationId');
  if (!id) return Response.json({ error: 'reservationId required' }, { status: 400 });
  const { data } = await supabaseAdmin.from('damage_inspections').select('*').eq('reservation_id', id).single();
  return Response.json({ inspection: data ?? null });
}

export async function POST(req) {
  if (!supabaseAdmin) return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const b = await req.json();
    if (!b.reservationId) return Response.json({ error: 'reservationId required' }, { status: 400 });
    const patch = { reservation_id: b.reservationId, updated_at: new Date().toISOString() };
    if (b.photos !== undefined) patch.photos = b.photos;
    if (b.analysis !== undefined) patch.analysis = b.analysis;
    if (b.estCost !== undefined) patch.est_cost = Math.max(0, Math.round(Number(b.estCost) || 0));
    if (b.mode !== undefined) patch.mode = b.mode;
    const { data, error } = await supabaseAdmin
      .from('damage_inspections').upsert(patch, { onConflict: 'reservation_id' }).select().single();
    if (error) throw new Error(error.message);
    return Response.json({ inspection: data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
