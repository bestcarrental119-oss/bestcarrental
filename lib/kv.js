/**
 * Upstash Redis helper — persistent storage for Best Car Rental
 *
 * Setup:
 *   1. Go to https://upstash.com → create a Redis database (free tier)
 *   2. Copy REST URL + Token → add to Vercel Environment Variables:
 *      UPSTASH_REDIS_REST_URL=https://...upstash.io
 *      UPSTASH_REDIS_REST_TOKEN=AX...
 *   3. For local dev: copy to .env.local
 *
 * Keys: bcr:vehicles | bcr:reservations | bcr:users | bcr:parking | bcr:theme | bcr:hero-banners
 */
import { Redis } from '@upstash/redis';
import {
  INIT_VEHICLES, INIT_PARKING,
  INIT_RESERVATIONS, INIT_USERS, INIT_THEME, INIT_HERO_BANNERS,
  INIT_LEGAL_PAGES,
} from './data';

// Lazy-init Redis client (safe to import in server components)
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null; // KV not configured — caller handles gracefully
  }
  _redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

const K = {
  vehicles:     'bcr:vehicles',
  reservations: 'bcr:reservations',
  users:        'bcr:users',
  parking:      'bcr:parking',
  theme:        'bcr:theme',
  heroBanners:  'bcr:hero-banners',
  legalPages:   'bcr:legal-pages',
};

// ── Generic helpers ──────────────────────────────────────────────────────────
async function redisGet(key) {
  const r = getRedis();
  if (!r) return null;
  return r.get(key);
}

async function redisSet(key, value) {
  const r = getRedis();
  if (!r) return;
  await r.set(key, value);
}

async function getOrInit(key, fallback) {
  const val = await redisGet(key);
  if (val !== null && val !== undefined) return val;
  await redisSet(key, fallback);
  return fallback;
}

// ── Rate-limit lock (for email notification debouncing) ──────────────────────
// Returns true if the lock was acquired (i.e. it's OK to act). When Redis is
// not configured we return true so the action still happens.
export async function acquireNotifyLock(key, ttlSec = 600) {
  const r = getRedis();
  if (!r) return true;
  try {
    const res = await r.set(key, '1', { nx: true, ex: ttlSec });
    return res === 'OK' || res === true;
  } catch (_) {
    return true;
  }
}

// ── Saved cards (per user) ───────────────────────────────────────────────────
// Stored at `bcr:cards:<userId>` as an array of masked card metadata objects.
// Never store raw PAN/CVC — only Stripe ids + masked brand/last4.
export async function getCards(userId) {
  if (!userId) return [];
  const list = await redisGet(`bcr:cards:${userId}`);
  return Array.isArray(list) ? list : [];
}

export async function saveCardKv(userId, card) {
  if (!userId) return [];
  const list = await getCards(userId);
  const id = card.id ?? `card_${Date.now()}`;
  const next = [
    { ...card, id },
    ...list.filter(c => c.id !== id && c.paymentMethodId !== card.paymentMethodId),
  ].slice(0, 5);
  await redisSet(`bcr:cards:${userId}`, next);
  return next;
}

export async function deleteCardKv(userId, cardId) {
  if (!userId) return [];
  const list = await getCards(userId);
  const next = list.filter(c => c.id !== cardId);
  await redisSet(`bcr:cards:${userId}`, next);
  return next;
}

// ── Vehicles ─────────────────────────────────────────────────────────────────
export async function getVehicles() {
  return getOrInit(K.vehicles, INIT_VEHICLES);
}

export async function saveVehicle(vehicle) {
  const list = await getVehicles();
  const idx  = list.findIndex(v => v.id === vehicle.id);
  const next = idx >= 0
    ? list.map(v => v.id === vehicle.id ? vehicle : v)
    : [...list, { ...vehicle, id: vehicle.id ?? Date.now() }];
  await redisSet(K.vehicles, next);
  return next;
}

export async function deleteVehicle(id) {
  const list = await getVehicles();
  const next = list.filter(v => String(v.id) !== String(id));
  await redisSet(K.vehicles, next);
  return next;
}

// ── Reservations ─────────────────────────────────────────────────────────────
export async function getReservations() {
  return getOrInit(K.reservations, INIT_RESERVATIONS);
}

export async function saveReservation(res) {
  const list = await getReservations();
  const idx  = list.findIndex(r => r.id === res.id);
  const next = idx >= 0
    ? list.map(r => r.id === res.id ? res : r)
    : [...list, res];
  await redisSet(K.reservations, next);
  return next;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUsers() {
  return getOrInit(K.users, INIT_USERS);
}

export async function saveUser(u) {
  const list = await getUsers();
  const idx  = list.findIndex(x => x.id === u.id);
  const next = idx >= 0 ? list.map(x => x.id === u.id ? u : x) : [...list, u];
  await redisSet(K.users, next);
  return next;
}

// ── Parking ───────────────────────────────────────────────────────────────────
export async function getParking() {
  return getOrInit(K.parking, INIT_PARKING);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
export async function getTheme() {
  return getOrInit(K.theme, INIT_THEME);
}

export async function saveTheme(patch) {
  const current = await getTheme();
  const next    = { ...current, ...patch };
  await redisSet(K.theme, next);
  return next;
}

// ── Hero banners ─────────────────────────────────────────────────────────────
function isLegacyDefaultHeroBanners(value) {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const legacySrcs = ['/hero-banner-1.jpeg', '/hero-banner-2.jpeg', '/hero-banner-3.jpeg', '/hero-banner-4.jpeg'];
  return value.every((banner, index) => banner?.src === legacySrcs[index]);
}

export async function getHeroBanners() {
  const val = await redisGet(K.heroBanners);
  if (isLegacyDefaultHeroBanners(val)) {
    await redisSet(K.heroBanners, INIT_HERO_BANNERS);
    return INIT_HERO_BANNERS;
  }
  if (val !== null && val !== undefined) return val;
  await redisSet(K.heroBanners, INIT_HERO_BANNERS);
  return INIT_HERO_BANNERS;
}

export async function saveHeroBanners(banners) {
  const next = Array.isArray(banners) ? banners : INIT_HERO_BANNERS;
  await redisSet(K.heroBanners, next);
  return next;
}

// ── Legal / Contact pages (admin-editable) ───────────────────────────────────
export async function getLegalPages() {
  const val = await getOrInit(K.legalPages, INIT_LEGAL_PAGES);
  // 不足キーをデフォルトで補完（後方互換）
  return {
    privacy: { ...INIT_LEGAL_PAGES.privacy, ...(val?.privacy ?? {}) },
    terms:   { ...INIT_LEGAL_PAGES.terms,   ...(val?.terms   ?? {}) },
    contact: { ...INIT_LEGAL_PAGES.contact, ...(val?.contact ?? {}) },
  };
}

export async function saveLegalPages(patch) {
  const current = await getLegalPages();
  const next = {
    privacy: { ...current.privacy, ...(patch?.privacy ?? {}) },
    terms:   { ...current.terms,   ...(patch?.terms   ?? {}) },
    contact: { ...current.contact, ...(patch?.contact ?? {}) },
  };
  await redisSet(K.legalPages, next);
  return next;
}

// ── Bulk fetch (for context hydration on page load) ──────────────────────────
export async function getAllData() {
  const r = getRedis();
  if (!r) {
    // Redis not configured — return seed data so app still works
    return {
      vehicles:     INIT_VEHICLES,
      reservations: INIT_RESERVATIONS,
      users:        INIT_USERS,
      parking:      INIT_PARKING,
      theme:        INIT_THEME,
      heroBanners:  INIT_HERO_BANNERS,
      legalPages:   INIT_LEGAL_PAGES,
      _source:      'seed', // tells frontend KV is not connected
    };
  }

  const [vehicles, reservations, users, parking, theme, heroBanners, legalPages] = await Promise.all([
    getVehicles(), getReservations(), getUsers(), getParking(), getTheme(), getHeroBanners(), getLegalPages(),
  ]);
  return { vehicles, reservations, users, parking, theme, heroBanners, legalPages, _source: 'redis' };
}
