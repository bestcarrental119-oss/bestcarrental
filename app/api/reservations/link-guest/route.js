import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { reservationId, guestToken, email, userId, drivePassId } = await req.json();
  if (!reservationId || !guestToken || !email || !userId) {
    return NextResponse.json({ error: 'reservationId, guestToken, email and userId required' }, { status: 400 });
  }

  const updates = {
    user_id: userId,
    guest_booking_token: null,
  };
  if (drivePassId) updates.drive_pass_id = drivePassId;

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update(updates)
    .eq('id', reservationId)
    .eq('guest_booking_token', guestToken)
    .eq('guest_email', email)
    .is('user_id', null)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Guest reservation not found or already linked' }, { status: 404 });

  return NextResponse.json({ success: true, reservation: data });
}
