import { NextResponse } from 'next/server';
import { sendPasswordResetLink } from '../../../../lib/passwordReset';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const result = await sendPasswordResetLink({
    email: body?.email,
    locale: body?.locale ?? 'ja',
    requestOrigin: new URL(req.url).origin,
  });

  if (!result.ok) {
    return NextResponse.json({
      error: result.error,
      retryAfter: result.retryAfter,
    }, { status: result.status ?? 500 });
  }

  return NextResponse.json({ ok: true });
}
