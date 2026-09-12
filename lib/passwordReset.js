import { authRedirectTo } from './authRedirect';
import { sendPasswordResetEmail } from './email';
import { createOtp } from './otp';
import { supabaseAdmin } from './supabase';

export const PASSWORD_RESET_THROTTLE_PURPOSE = 'password_reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeResetEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function buildPasswordResetRedirect({ requestOrigin } = {}) {
  return authRedirectTo('/reset-password', {
    requestOrigin,
    env: process.env,
  });
}

function missingUserError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes('not found')
    || message.includes('user_not_found')
    || message.includes('no user')
    || message.includes('does not exist');
}

function recoveryActionLink(data) {
  return data?.properties?.action_link
    ?? data?.properties?.actionLink
    ?? data?.action_link
    ?? data?.actionLink
    ?? '';
}

export async function sendPasswordResetLink({ email, locale = 'ja', requestOrigin } = {}) {
  const normalizedEmail = normalizeResetEmail(email);
  if (!EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, status: 400, error: 'invalid_email' };
  }
  if (!supabaseAdmin) {
    return { ok: false, status: 503, error: 'supabase_not_configured' };
  }
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, status: 503, error: 'email_not_configured' };
  }

  const throttle = await createOtp(PASSWORD_RESET_THROTTLE_PURPOSE, normalizedEmail);
  if (throttle?.error === 'too_soon') {
    return { ok: false, status: 429, error: 'too_soon', retryAfter: throttle.retryAfter };
  }

  const redirectTo = buildPasswordResetRedirect({ requestOrigin });
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: normalizedEmail,
    options: { redirectTo },
  });

  if (error) {
    if (missingUserError(error)) return { ok: true, skipped: true, reason: 'user_not_found' };
    return { ok: false, status: 500, error: 'reset_link_failed' };
  }

  const actionLink = recoveryActionLink(data);
  if (!actionLink) return { ok: false, status: 500, error: 'reset_link_failed' };

  const sent = await sendPasswordResetEmail({
    to: normalizedEmail,
    resetUrl: actionLink,
    locale,
  });
  if (sent?.skipped) return { ok: false, status: 503, error: 'email_not_configured' };
  if (sent?.ok === false) return { ok: false, status: 502, error: 'send_failed' };

  return { ok: true };
}
