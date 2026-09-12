/**
 * Email verification codes (OTP) — signup & email-change flows.
 *
 * A 6-digit numeric code is generated, hashed, and stored with a short TTL.
 * The user proves ownership of the address by entering the code we emailed.
 *
 * Storage strategy (graceful degradation):
 *   1. Upstash Redis (preferred)  — key `bcr:otp:<purpose>:<email>` (TTL).
 *   2. Supabase table `email_otps` — durable fallback when Redis is absent.
 *   3. In-memory Map              — last resort for local dev without either.
 *
 * We never store the raw code — only a SHA-256 hash. Codes expire after
 * OTP_TTL_SEC and are limited to MAX_ATTEMPTS verification tries.
 */
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { supabaseAdmin } from './supabase';

export const OTP_TTL_SEC = 10 * 60;      // 10 minutes
export const OTP_RESEND_SEC = 60;        // min seconds between sends
const MAX_ATTEMPTS = 5;

// ── low-level stores ─────────────────────────────────────────────────────────
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

// dev-only in-memory fallback (per-process, not shared across serverless invocations)
const _mem = new Map();

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
function genCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function key(purpose, email) {
  return `bcr:otp:${purpose}:${normEmail(email)}`;
}

async function storeSet(purpose, email, record) {
  const r = getRedis();
  if (r) { await r.set(key(purpose, email), record, { ex: OTP_TTL_SEC }); return; }
  if (supabaseAdmin) {
    await supabaseAdmin.from('email_otps').upsert({
      purpose,
      email: normEmail(email),
      code_hash: record.hash,
      attempts: record.attempts,
      expires_at: new Date(record.exp).toISOString(),
      created_at: new Date(record.created).toISOString(),
    }, { onConflict: 'purpose,email' });
    return;
  }
  _mem.set(key(purpose, email), record);
}

async function storeGet(purpose, email) {
  const r = getRedis();
  if (r) { return (await r.get(key(purpose, email))) || null; }
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('email_otps')
      .select('code_hash, attempts, expires_at, created_at')
      .eq('purpose', purpose).eq('email', normEmail(email))
      .maybeSingle();
    if (!data) return null;
    return {
      hash: data.code_hash,
      attempts: data.attempts ?? 0,
      exp: new Date(data.expires_at).getTime(),
      created: new Date(data.created_at).getTime(),
    };
  }
  return _mem.get(key(purpose, email)) || null;
}

async function storeDel(purpose, email) {
  const r = getRedis();
  if (r) { await r.del(key(purpose, email)); return; }
  if (supabaseAdmin) {
    await supabaseAdmin.from('email_otps').delete().eq('purpose', purpose).eq('email', normEmail(email));
    return;
  }
  _mem.delete(key(purpose, email));
}

// ── public API ───────────────────────────────────────────────────────────────
/**
 * Create a new code for (purpose, email). Returns { code } to be emailed, or
 * { error, retryAfter } when a code was requested too recently.
 */
export async function createOtp(purpose, email) {
  const existing = await storeGet(purpose, email);
  if (existing?.created) {
    const since = (Date.now() - existing.created) / 1000;
    if (since < OTP_RESEND_SEC) {
      return { error: 'too_soon', retryAfter: Math.ceil(OTP_RESEND_SEC - since) };
    }
  }
  const code = genCode();
  await storeSet(purpose, email, {
    hash: hashCode(code),
    attempts: 0,
    exp: Date.now() + OTP_TTL_SEC * 1000,
    created: Date.now(),
  });
  return { code };
}

/**
 * Verify a submitted code. Returns { ok:true } on success (and consumes it),
 * otherwise { ok:false, reason }.
 */
export async function verifyOtp(purpose, email, code) {
  const rec = await storeGet(purpose, email);
  if (!rec) return { ok: false, reason: 'expired' };
  if (Date.now() > rec.exp) { await storeDel(purpose, email); return { ok: false, reason: 'expired' }; }
  if ((rec.attempts ?? 0) >= MAX_ATTEMPTS) { await storeDel(purpose, email); return { ok: false, reason: 'too_many' }; }

  if (hashCode(code) !== rec.hash) {
    const next = { ...rec, attempts: (rec.attempts ?? 0) + 1 };
    await storeSet(purpose, email, next);
    // keep original created/exp so resend throttle & TTL are unchanged
    return { ok: false, reason: 'mismatch', remaining: Math.max(0, MAX_ATTEMPTS - next.attempts) };
  }
  await storeDel(purpose, email);
  return { ok: true };
}
