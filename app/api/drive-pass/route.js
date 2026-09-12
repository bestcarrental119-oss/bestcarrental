import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await req.json();
  const { userId, legalName, preferredLanguage, emergencyContactName, emergencyContactPhone, idpExpiresOn } = body;
  if (!userId || !legalName) {
    return NextResponse.json({ error: 'userId and legalName required' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      display_name: legalName,
      preferred_language: preferredLanguage ?? 'en',
      phone: body.phone ?? null,
    }, { onConflict: 'id' })
    .select()
    .single();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { data: pass, error: passError } = await supabaseAdmin
    .from('japan_drive_passes')
    .insert({
      user_id: userId,
      legal_name: legalName,
      preferred_language: preferredLanguage ?? 'en',
      emergency_contact_name: emergencyContactName ?? null,
      emergency_contact_phone: emergencyContactPhone ?? null,
      insurance_preference: body.insurancePreference ?? null,
      etc_preference: body.etcPreference ?? false,
      driving_experience: body.drivingExperience ?? null,
      idp_expires_on: idpExpiresOn ?? null,
      screening_status: body.submitForReview ? 'pending' : 'draft',
    })
    .select()
    .single();

  if (passError) return NextResponse.json({ error: passError.message }, { status: 500 });
  return NextResponse.json({ profile, pass }, { status: 201 });
}
