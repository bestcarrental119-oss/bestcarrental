// ── Master (developer) account ───────────────────────────────────────────────
// A fixed developer account sits above admins. Email is the normal identifier;
// the auth user id is also accepted so the browser keeps master routing even if
// metadata/email hydration is delayed or provider-specific.

export const MASTER_EMAIL = String(
  process.env.NEXT_PUBLIC_MASTER_EMAIL ||
  process.env.MASTER_EMAIL ||
  'agentkaku0221@gmail.com',
).trim().toLowerCase();

export const MASTER_USER_IDS = String(
  process.env.NEXT_PUBLIC_MASTER_USER_IDS ||
  process.env.NEXT_PUBLIC_MASTER_USER_ID ||
  process.env.MASTER_USER_IDS ||
  process.env.MASTER_USER_ID ||
  '6d3591dd-d180-4e13-af53-4b8f4ebd0d89',
)
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

export function isMasterEmail(email) {
  return Boolean(email) && String(email).trim().toLowerCase() === MASTER_EMAIL;
}

export function isMasterUserId(id) {
  return Boolean(id) && MASTER_USER_IDS.includes(String(id).trim());
}

export function isMasterUser(user) {
  return Boolean(user) && (isMasterEmail(user.email) || isMasterUserId(user.id));
}
