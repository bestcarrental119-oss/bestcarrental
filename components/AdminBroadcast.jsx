'use client';
import { useEffect, useState, useCallback } from 'react';

// 管理者/マスター用: 全オーナーへ一斉お知らせを送る画面
export default function AdminBroadcast({ currentUser }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentUser?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/announcements?requesterId=${encodeURIComponent(currentUser.id)}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const text = body.trim();
    if (!text) { setMessage('本文を入力してください。'); return; }
    setSending(true); setMessage('');
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, title: title.trim(), body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data?.error || '送信に失敗しました。');
      else { setTitle(''); setBody(''); setMessage('全オーナーに送信しました。'); load(); }
    } catch (e) { setMessage(String(e?.message || e)); }
    setSending(false);
  };

  const deactivate = async (id) => {
    try {
      await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, action: 'deactivate', id }),
      });
      load();
    } catch {}
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 text-gray-100">
      <div>
        <h2 className="text-xl font-black">📢 オーナーへ一斉お知らせ</h2>
        <p className="mt-1 text-sm text-gray-400">
          全オーナーアカウントに通知します。オーナーのダッシュボードにバナーとベル通知（未読バッジ付き）で表示されます。
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル（任意）"
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="本文（必須）"
          rows={5}
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {sending ? '送信中…' : '全オーナーに送信'}
          </button>
          {message && <span className="text-sm text-gray-300">{message}</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-gray-300">送信済みのお知らせ</h3>
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">まだありません。</p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {a.title && <p className="font-semibold text-white">{a.title}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-300">{a.body}</p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {new Date(a.created_at).toLocaleString('ja-JP')}
                      {a.created_by_email ? ` · ${a.created_by_email}` : ''}
                      {a.active ? '' : '（停止中）'}
                    </p>
                  </div>
                  {a.active && (
                    <button
                      onClick={() => deactivate(a.id)}
                      className="shrink-0 rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-red-500 hover:text-red-300"
                    >
                      停止
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
