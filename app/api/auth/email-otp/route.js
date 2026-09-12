/**
 * Email verification codes for signup & email change.
 *
 * POST { action:'send',   purpose, email, locale }
 *   → generates a 6-digit code, stores it (hashed) and emails it.
 *
 * POST { action:'verify', purpose, email, code, userId? }
 *   → checks the code. For purpose 'change_email' a successful verify also
 *     applies the new email to the user (userId required).
 *
 * purpose ∈ { 'signup', 'change_email' }
 */
import { NextResponse } from 'next/server';
import { createOtp, verifyOtp } from '../../../../lib/otp';
import { sendVerificationCode } from '../../../../lib/email';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 'owner_email' verifies that the store contact email on an owner application is
// real & reachable. Unlike signup/change_email it does NOT require the address
// to be unused — an owner often applies with their own account email.
const PURPOSES = new Set(['signup', 'change_email', 'owner_email']);

async function emailInUse(email) {
  if (!supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const target = String(email).trim().toLowerCase();
    return (data?.users ?? []).some(u => (u.email ?? '').toLowerCase() === target);
  } catch { return false; }
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const { action, purpose, email, code, userId, locale = 'ja', register } = body || {};

  if (!PURPOSES.has(purpose)) return NextResponse.json({ error: 'invalid_purpose' }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  // ── SEND ────────────────────────────────────────────────────────────────
  if (action === 'send') {
    // For change_email the target must be free; for signup Supabase enforces it
    // at signUp time, but we can warn early to save a round trip. 'owner_email'
    // is only proving reachability, so an already-registered address is fine.
    if (purpose !== 'owner_email' && await emailInUse(email)) {
      return NextResponse.json({ error: 'email_in_use' }, { status: 409 });
    }
    const { code: newCode, error, retryAfter } = await createOtp(purpose, email);
    if (error === 'too_soon') return NextResponse.json({ error: 'too_soon', retryAfter }, { status: 429 });

    const sent = await sendVerificationCode({ to: email, code: newCode, locale, purpose });
    // When Resend isn't configured we cannot email — surface a clear error so
    // the UI doesn't silently strand the user (dev builds still log the code).
    if (sent?.skipped) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[email-otp] DEV code for ${email} (${purpose}): ${newCode}`);
        return NextResponse.json({ ok: true, devCode: newCode, devNoEmail: true });
      }
      return NextResponse.json({ error: 'email_not_configured' }, { status: 503 });
    }
    if (sent?.ok === false) return NextResponse.json({ error: 'send_failed', detail: sent.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  // ── VERIFY ──────────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!code || !/^\d{6}$/.test(String(code))) return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
    const result = await verifyOtp(purpose, email, String(code));
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, remaining: result.remaining }, { status: 400 });
    }

    // Apply the email change now that ownership of the new address is proven.
    if (purpose === 'change_email') {
      if (!supabaseAdmin) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
      if (!userId) return NextResponse.json({ error: 'missing_user' }, { status: 400 });
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (upErr) return NextResponse.json({ error: 'update_failed', detail: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, email });
    }

    // Signup: create the account server-side as already-confirmed so there's no
    // second confirmation email and the user can sign in immediately. Falls back
    // to client-side signUp when the service role key isn't configured.
    if (purpose === 'signup' && register) {
      if (!supabaseAdmin) return NextResponse.json({ ok: true, createClientSide: true });
      const { password, name, phone } = register;
      if (!password) return NextResponse.json({ error: 'missing_password' }, { status: 400 });
      const { error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone, role: 'user', bookingProfile: { phone } },
      });
      if (cErr) return NextResponse.json({ error: 'create_failed', detail: cErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, created: true });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
