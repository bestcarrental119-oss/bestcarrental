// GET  /api/pages — fetch editable site pages (privacy / terms / contact)
// POST /api/pages — save patch (admin)
import { NextResponse } from 'next/server';
import { getPages, savePages } from '../../../lib/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pages = await getPages();
    return NextResponse.json(pages);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const patch = await req.json();
    const next  = await savePages(patch);
    return NextResponse.json(next);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
