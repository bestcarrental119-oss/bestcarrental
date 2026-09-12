import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { sendChatEmail } from '../../../../lib/email';
import { acquireNotifyLock } from '../../../../lib/kv';
export const dynamic = 'force-dynamic';

// 受信者の auth ユーザー / メール / 表示名 / 言語を解決
async function resolveRecipient(recipientId) {
  if (!recipientId) return null;
  // 1) auth ユーザーとして直接取得
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    if (data?.user?.email) {
      const m = data.user.user_metadata ?? {};
      return { email: data.user.email, name: m.name ?? data.user.email, locale: m.locale ?? m.lang ?? 'ja' };
    }
  } catch (_) {}
  // 2) owners テーブル経由（owner_user_id が owners.id の場合）
  try {
    const { data: owner } = await supabaseAdmin
      .from('owners').select('user_id, store_name, contact_email')
      .or(`id.eq.${recipientId},user_id.eq.${recipientId}`).maybeSingle();
    if (owner?.contact_email) return { email: owner.contact_email, name: owner.store_name ?? 'Owner', locale: 'ja' };
    if (owner?.user_id) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(owner.user_id);
      if (data?.user?.email) {
        const m = data.user.user_metadata ?? {};
        return { email: data.user.email, name: owner.store_name ?? m.name ?? 'Owner', locale: m.locale ?? 'ja' };
      }
    }
  } catch (_) {}
  return null;
}

export async function GET(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const targetLang = searchParams.get('targetLang') ?? 'ja';
  const { data: messages, error } = await supabaseAdmin
    .from('messages').select('*').eq('conversation_id', params.id).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const baseUrl = new URL(req.url).origin;
  const translated = await Promise.all((messages ?? []).map(async (msg) => {
    if (!msg.detected_lang || msg.detected_lang === targetLang)
      return { ...msg, translated_content: null, is_translated: false };
    try {
      const res = await fetch(`${baseUrl}/api/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.content, targetLang, sourceLang: msg.detected_lang }),
      });
      const { translated: t } = await res.json();
      return { ...msg, translated_content: t, is_translated: true };
    } catch { return { ...msg, translated_content: null, is_translated: false }; }
  }));
  return NextResponse.json(translated);
}

export async function POST(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { senderId, senderRole, content, detectedLang } = await req.json();
  if (!senderId || !content) return NextResponse.json({ error: 'senderId and content required' }, { status: 400 });
  const { data: saved, error } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: params.id, sender_id: senderId, sender_role: senderRole ?? 'user', content, detected_lang: detectedLang ?? 'ja', is_read: false })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', params.id);
  try {
    const { data: conv } = await supabaseAdmin.from('conversations')
      .select('owner_user_id, user_id, vehicle_id').eq('id', params.id).single();
    if (conv) {
      const notifyUserId = senderRole === 'owner' ? conv.user_id : conv.owner_user_id;
      // ── アプリ内リアルタイム通知（即時トースト用） ──
      const ch = supabaseAdmin.channel(`notify:${notifyUserId}`);
      await ch.send({ type: 'broadcast', event: 'new_message',
        payload: { conversationId: params.id, senderRole, content: content.slice(0, 50), vehicleId: conv.vehicle_id } });

      // ── メール通知（オフライン相手向け・同一会話は10分に1回まで） ──
      try {
        const lockOk = await acquireNotifyLock(`notify:email:${params.id}:${notifyUserId}`, 600);
        if (lockOk) {
          const recipient = await resolveRecipient(notifyUserId);
          if (recipient?.email) {
            let vehicleName = '';
            if (conv.vehicle_id) {
              const { data: veh } = await supabaseAdmin.from('vehicles')
                .select('maker, model').eq('id', conv.vehicle_id).maybeSingle();
              if (veh) vehicleName = `${veh.maker ?? ''} ${veh.model ?? ''}`.trim();
            }
            const senderLabel = senderRole === 'owner' ? 'オーナー' : (saved?.sender_name ?? 'お客様');
            const appUrl = new URL(req.url).origin;
            await sendChatEmail({
              to: recipient.email, recipientName: recipient.name, senderName: senderLabel,
              vehicleName, preview: content.slice(0, 160), locale: recipient.locale, appUrl,
            });
          }
        }
      } catch (e) { console.warn('[notify:email]', e.message); }
    }
  } catch (e) { console.warn('[notify]', e.message); }
  return NextResponse.json(saved, { status: 201 });
}

export async function PATCH(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { readerId } = await req.json();
  if (!readerId) return NextResponse.json({ error: 'readerId required' }, { status: 400 });
  const { error } = await supabaseAdmin.from('messages')
    .update({ is_read: true }).eq('conversation_id', params.id).eq('is_read', false).neq('sender_id', readerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
