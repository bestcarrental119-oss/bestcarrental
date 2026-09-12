// ── Form validation helpers ───────────────────────────────────────────────────

// RFC5322-lite email check
export function validateEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// International phone validation.
// Accepts "+81 90-1234-5678", "09012345678", etc.
// Returns { ok, normalized, reason }
export function validatePhone(phone, dial = '') {
  if (!phone) return { ok: false, reason: 'empty' };
  const raw = phone.trim();
  if (!/^[+\d][\d\s\-()]*$/.test(raw)) return { ok: false, reason: 'chars' };
  let digits = raw.replace(/[^\d]/g, '');
  // Strip leading 0 for domestic format when a dial code is provided
  let normalized;
  if (raw.startsWith('+')) {
    normalized = `+${digits}`;
  } else if (dial) {
    if (digits.startsWith('0')) digits = digits.slice(1);
    normalized = `+${dial}${digits}`;
  } else {
    normalized = digits;
  }
  const len = normalized.replace(/\D/g, '').length;
  if (len < 7 || len > 15) return { ok: false, reason: 'length' };
  return { ok: true, normalized };
}

// Password strength (min 8 chars, at least one letter + one number)
export function validatePassword(pass) {
  if (!pass || pass.length < 8) return { ok: false, reason: 'length' };
  if (!/[a-zA-Z]/.test(pass) || !/\d/.test(pass)) return { ok: false, reason: 'mix' };
  return { ok: true };
}
