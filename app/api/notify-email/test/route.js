// GET /api/notify-email/test?to=you@example.com
// Sends a sample chat-notification email so you can verify Resend + DNS setup.
// Returns the send result. Safe: only works when RESEND_API_KEY is configured.
import { NextResponse } from 'next/server';
import { sendChatEmail } from '../../../../lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to');
  if (!to) return NextResponse.json({ error: 'Add ?to=your@email.com' }, { status: 400 });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'RESEND_API_KEY is not set in your environment.' }, { status: 503 });
  }

  const result = await sendChatEmail({
    to,
    recipientName: 'Test User',
    senderName: 'BEST Car Rental',
    vehicleName: 'Toyota Alphard 2024',
    preview: 'これはメール通知のテストです。届いていれば設定は完了です！ / This is a test notification email.',
    locale: 'ja',
    appUrl: new URL(req.url).origin,
  });

  return NextResponse.json(result);
}
