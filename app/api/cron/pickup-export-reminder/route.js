/**
 * GET /api/cron/pickup-export-reminder
 *
 * ~7 days before a pickup record (IDP images + handover photos) is auto-deleted
 * (purge_after), email the owner so they can export/download anything they need
 * to keep. Sends once per record (reminder_sent_at). Run daily via Vercel Cron.
 * Protected by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { sendEmail } from '../../../../lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bestcar-rental.com';

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const now = Date.now();
  const soon = new Date(now + 7 * 86400000).toISOString();

  // Records expiring within 7 days that haven't been reminded yet.
  const { data: due, error } = await supabaseAdmin
    .from('owner_pickup_records')
    .select('id, owner_id, reservation_id, purge_after, reservation_info')
    .lt('purge_after', soon)
    .gt('purge_after', new Date(now).toISOString())
    .is('reminder_sent_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ reminded: 0 });

  // Resolve owner emails once.
  const { data: owners } = await supabaseAdmin.from('owners').select('id, user_id, email, booking_email_contact, store_name');
  const emailByOwner = new Map();
  const nameByOwner = new Map();
  for (const o of owners ?? []) {
    const email = o.email || o.booking_email_contact || null;
    [o.id, o.user_id].filter(Boolean).forEach(k => {
      if (email) emailByOwner.set(String(k), email);
      nameByOwner.set(String(k), o.store_name || '');
    });
  }

  // Group records by owner.
  const byOwner = new Map();
  for (const r of due) {
    const k = String(r.owner_id);
    if (!byOwner.has(k)) byOwner.set(k, []);
    byOwner.get(k).push(r);
  }

  let emailed = 0;
  const remindedIds = [];
  for (const [ownerId, recs] of byOwner.entries()) {
    const to = emailByOwner.get(ownerId);
    const rows = recs.map(r => {
      const del = r.purge_after ? new Date(r.purge_after).toLocaleDateString() : '';
      const veh = r.reservation_info?.vehicleId ?? '';
      return `<tr><td style="padding:6px 12px 6px 0">${r.reservation_id}</td><td style="padding:6px 0;color:#dc2626">${del}</td></tr>`;
    }).join('');
    const link = `${APP_URL}/?owner=pickup`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <div style="background:linear-gradient(135deg,#d97706,#f59e0b);border-radius:16px;padding:20px;color:#fff">
          <h2 style="margin:0;font-size:18px">🗂 受渡し記録の保存期限が近づいています</h2>
        </div>
        <div style="border:1px solid #eee;border-top:none;border-radius:0 0 16px 16px;padding:20px;color:#374151;font-size:14px;line-height:1.6">
          <p>以下の予約の受渡し記録（本人確認書類・受取/返却写真）は、まもなく自動削除されます。<b>必要な場合は削除前にダウンロード（エクスポート）してください。</b></p>
          <table style="border-collapse:collapse;margin:12px 0"><tr><th style="text-align:left;padding:6px 12px 6px 0">予約</th><th style="text-align:left">削除予定日</th></tr>${rows}</table>
          <a href="${link}" style="display:inline-block;margin-top:8px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:10px">アプリで開いてエクスポート →</a>
          <p style="color:#9ca3af;font-size:11px;margin-top:20px">BEST Car Rental · 個人情報保護のため、記録は返却から30日で自動削除されます。</p>
        </div>
      </div>`;

    if (to) {
      const r = await sendEmail({ to, subject: '🗂 受渡し記録の保存期限が近づいています — BEST Car Rental', html });
      if (r.ok || r.skipped) emailed++;
    }
    recs.forEach(x => remindedIds.push(x.id));
  }

  // Mark reminded (even if email was skipped/no address) so we don't retry daily.
  if (remindedIds.length) {
    await supabaseAdmin.from('owner_pickup_records')
      .update({ reminder_sent_at: new Date().toISOString() })
      .in('id', remindedIds);
  }

  return NextResponse.json({ reminded: remindedIds.length, emailed, owners: byOwner.size });
}
