/**
 * Inventory Lock API — Upstash Redis (15-minute hold)
 *
 * POST /api/lock          — Acquire lock for a vehicle
 * DELETE /api/lock        — Release lock (after payment or cancel)
 * GET /api/lock?id=xxx    — Check if vehicle is currently locked
 *
 * Lock key: lock:vehicle:{vehicleId}
 * TTL: 900 seconds (15 minutes)
 * Value: userId who holds the lock
 *
 * Uses SETNX (SET if Not eXists) to ensure atomic lock acquisition.
 * Only one user can hold a lock at a time.
 */
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const LOCK_TTL = 900; // 15 minutes in seconds
const PREFIX   = 'lock:vehicle:';

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ── POST — Acquire lock ───────────────────────────────────────────
// Body: { vehicleId: string, userId: string }
export async function POST(req) {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });

  const { vehicleId, userId } = await req.json();
  if (!vehicleId || !userId) {
    return NextResponse.json({ error: 'vehicleId and userId required' }, { status: 400 });
  }

  const key = `${PREFIX}${vehicleId}`;

  // SETNX: only sets if key does NOT exist (atomic)
  // Returns 1 if set (lock acquired), 0 if already locked
  const acquired = await redis.set(key, userId, {
    nx:  true,   // Only set if not exists
    ex:  LOCK_TTL,
  });

  if (!acquired) {
    // Lock already held — check who and how long remains
    const [holder, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);

    // Allow re-lock by the same user (e.g. page refresh)
    if (holder === userId) {
      await redis.expire(key, LOCK_TTL); // Reset TTL
      return NextResponse.json({
        locked:    true,
        ownLock:   true,
        ttl:       LOCK_TTL,
        expiresIn: LOCK_TTL,
        vehicleId,
        userId,
      });
    }

    return NextResponse.json({
      locked:    false,
      reason:    'Vehicle is currently reserved by another user',
      expiresIn: ttl,
      vehicleId,
    }, { status: 409 }); // 409 Conflict
  }

  return NextResponse.json({
    locked:    true,
    ownLock:   true,
    ttl:       LOCK_TTL,
    expiresIn: LOCK_TTL,
    vehicleId,
    userId,
  });
}

// ── DELETE — Release lock ─────────────────────────────────────────
// Body: { vehicleId: string, userId: string }
export async function DELETE(req) {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });

  const { vehicleId, userId } = await req.json();
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 });

  const key    = `${PREFIX}${vehicleId}`;
  const holder = await redis.get(key);

  // Only the lock owner (or admin) can release
  if (holder && holder !== userId) {
    return NextResponse.json({ error: 'Not the lock owner' }, { status: 403 });
  }

  await redis.del(key);
  return NextResponse.json({ released: true, vehicleId });
}

// ── GET — Check lock status ───────────────────────────────────────
// Query: ?id=vehicleId
export async function GET(req) {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ locked: false, reason: 'Redis not configured' });

  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('id');
  if (!vehicleId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const key  = `${PREFIX}${vehicleId}`;
  const [holder, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);

  return NextResponse.json({
    locked:    !!holder,
    vehicleId,
    holder:    holder ?? null,
    expiresIn: ttl > 0 ? ttl : 0,
  });
}
