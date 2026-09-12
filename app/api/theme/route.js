// POST /api/theme  — save theme patch
import { NextResponse } from 'next/server';
import { saveTheme } from '../../../lib/kv';

export async function POST(req) {
  try {
    const patch = await req.json();
    const next  = await saveTheme(patch);
    return NextResponse.json(next);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
