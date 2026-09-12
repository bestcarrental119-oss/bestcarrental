import { NextResponse } from 'next/server';
import { geocodeAddress } from '../../../lib/geocode';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const address = String(searchParams.get('address') ?? '').trim();
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  if (address.length > 300) return NextResponse.json({ error: 'address too long' }, { status: 400 });

  const hit = await geocodeAddress(address);
  if (!hit) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ...hit, formatted: address });
}

