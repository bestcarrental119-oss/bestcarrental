/**
 * POST /api/admin/geocode-vehicles
 *
 * One-off / repeatable backfill: finds vehicles that have an address (loc) but
 * no coordinates, geocodes each UNIQUE address once, and bulk-updates every
 * vehicle at that address. Because many vehicles share one dealer address, this
 * usually finishes in a single call with very few geocode requests.
 *
 * Safe to run repeatedly. Protected by CRON_SECRET when that env var is set;
 * otherwise an admin can trigger it from the dashboard.
 *
 * Body (optional): { maxAddresses } — cap unique addresses per call (default 5)
 * to stay within serverless time limits. Re-run until { remaining: 0 }.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { geocodeAddress } from '../../../../lib/geocode';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  // Optional protection
  const role = req.headers.get('x-user-role');
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let maxAddresses = 5;
  try { const b = await req.json(); if (b?.maxAddresses) maxAddresses = Math.min(20, Number(b.maxAddresses)); } catch { /* no body */ }

  // Vehicles with an address but missing coordinates.
  const { data: rows, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, loc, lat, lng')
    .or('lat.is.null,lng.is.null')
    .not('loc', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ updated: 0, remaining: 0, message: 'Nothing to geocode' });

  // Group vehicle ids by unique address.
  const byAddress = new Map();
  for (const r of rows) {
    const a = String(r.loc).trim();
    if (!a) continue;
    if (!byAddress.has(a)) byAddress.set(a, []);
    byAddress.get(a).push(r.id);
  }

  const addresses = [...byAddress.keys()];
  const batch = addresses.slice(0, maxAddresses);
  let updated = 0;
  let failed = 0;
  const failedAddresses = [];

  for (const address of batch) {
    const geo = await geocodeAddress(address);
    if (!geo) { failed++; failedAddresses.push(address); continue; }
    const ids = byAddress.get(address);
    const { error: upErr } = await supabaseAdmin
      .from('vehicles')
      .update({ lat: geo.lat, lng: geo.lng })
      .in('id', ids);
    if (upErr) { failed++; failedAddresses.push(address); continue; }
    updated += ids.length;
  }

  return NextResponse.json({
    updated,
    failedAddresses,
    addressesProcessed: batch.length,
    remaining: Math.max(0, addresses.length - batch.length),
    message: addresses.length > batch.length
      ? 'More addresses remain — call again to continue.'
      : 'Backfill complete.',
  });
}
