'use client';
import { useEffect, useState, useCallback } from 'react';

// オーナー用: 一斉お知らせの「バナー（未読最新）」＋「ベル通知一覧（既読管理）」
export default function OwnerAnnouncements({ currentUser }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/owner/announcements?requesterId=${encodeURIComponent(currentUser.id)}`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
      setUnread(Number(data?.unread || 0));
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    try {
      await fetch('/api/owner/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, action: 'read', id }),
      });
      load();
    } catch {}
  };

  const markAll = async () => {
    try {
      await fetch('/api/owner/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: currentUser?.id, action: 'read' }),
      });
      setDismissedBanner(true);
      load();
    } catch {}
  };

  if (!currentUser?.id) return null;
  const latestUnread = items.find((a) => !a.read);

  return (
    <>
      {/* 未読の最新お知らせをバナー表示 */}
      {!dismissedBanner && latestUnread && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
          <span className="text-lg">📢</span>
          <div className="min-w-0 flex-1">
            {latestUnread.title && <p className="font-bold text-amber-100">{latestUnread.title}</p>}
            <p className="whitespace-pre-wrap break-words text-sm text-amber-50/90">{latestUnread.body}</p>
            <p className="mt-1 text-[11px] text-amber-200/60">
              {new Date(latestUnread.created_at).toLocaleString('ja-JP')}
            </p>
          </div>
          <button
            onClick={() => markRead(latestUnread.id)}
            className="shrink-0 rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-bold text-amber-100 hover:bg-amber-500/30"
          >
            確認
          </button>
        </div>
      )}

      {/* ベル（未読バッジ + ドロップダウン一覧） */}
      <div className="mb-3 flex justify-end">
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="relative rounded-full border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:border-purple-500"
          >
            🔔 お知らせ
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
                <span className="text-sm font-bold text-white">お知らせ</span>
                {unread > 0 && (
                  <button onClick={markAll} className="text-xs text-purple-300 hover:text-purple-200">
                    すべて既読
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-gray-500">お知らせはありません。</p>
                ) : (
                  items.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => markRead(a.id)}
                      className={`block w-full border-b border-gray-800 px-3 py-2 text-left hover:bg-gray-800 ${a.read ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {!a.read && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                        {a.title && <span className="truncate text-sm font-semibold text-white">{a.title}</span>}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-gray-300">{a.body}</p>
                      <p className="mt-1 text-[10px] text-gray-500">
                        {new Date(a.created_at).toLocaleString('ja-JP')}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
