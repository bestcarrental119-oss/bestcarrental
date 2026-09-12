export const CANONICAL_APP_ORIGIN = 'https://www.bestcar-rental.com';

function parseHttpUrl(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  const urlLike = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(urlLike);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function normalizeOrigin(value) {
  return parseHttpUrl(value)?.origin?.replace(/\/+$/, '') ?? '';
}

function isPrivateIPv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function isLocalOrigin(value) {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '0:0:0:0:0:0:0:1' ||
    hostname.endsWith('.local') ||
    isPrivateIPv4(hostname)
  );
}

export function resolveAuthRedirectOrigin({ requestOrigin, windowOrigin, env = {} } = {}) {
  const configuredOrigin = normalizeOrigin(
    env.NEXT_PUBLIC_SITE_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    env.NEXT_PUBLIC_BASE_URL
  );
  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) return configuredOrigin;

  const vercelOrigin = normalizeOrigin(env.NEXT_PUBLIC_VERCEL_URL || env.VERCEL_URL);
  if (vercelOrigin && !isLocalOrigin(vercelOrigin)) return vercelOrigin;

  const runtimeOrigin = normalizeOrigin(windowOrigin || requestOrigin);
  if (runtimeOrigin && !isLocalOrigin(runtimeOrigin)) return runtimeOrigin;

  return CANONICAL_APP_ORIGIN;
}

export function authRedirectTo(path = '/reset-password', options = {}) {
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  return `${resolveAuthRedirectOrigin(options)}${cleanPath}`;
}
