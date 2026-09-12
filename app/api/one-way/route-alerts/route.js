/**
 * POST /api/one-way/route-alerts
 * Register a route alert so the user is notified when a matching transfer car opens.
 * Body: { userId?, email?, fromArea, toArea }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ ok: true, demo: true });
  try {
    const { userId, email, fromArea, toArea } = await req.json();
    if (!fromArea || !toArea) {
      return NextResponse.json({ error: 'fromArea and toArea are required' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('one_way_route_alerts')
      .insert({ user_id: userId ?? null, email: email ?? null, from_area: fromArea, to_area: toArea })
      .select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, alert: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
