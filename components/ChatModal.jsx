'use client';
/**
 * ChatModal — Airbnb風チャット（自動翻訳付き）
 * Props:
 *   open         boolean
 *   onClose      () => void
 *   vehicle      { id, maker, model, img_url, ownerId }  ← 車両情報
 *   currentUser  { id, name, role }
 *   targetLang   string  現在の表示言語（翻訳先）
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';

const LANG_CODE = {
  'en':    'en',
  'ja':    'ja',
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  'ko':    'ko',
};

const LANG_LABEL = {
  'en':    '🇺🇸 EN',
  'ja':    '🇯🇵 JA',
  'zh-TW': '🇹🇼 繁',
  'zh-CN': '🇨🇳 简',
  'ko':    '🇰🇷 KO',
};

function detectLanguage(text, fallback = 'ja') {
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return fallback;
}

function chatParticipantMeta(msg, viewerRole, viewerId, t) {
  const senderRole = msg.sender_role === 'owner' ? 'owner' : 'user';
  const mine = msg.sender_role === viewerRole || (!msg.sender_role && msg.sender_id === viewerId);
  if (viewerRole === 'user') {
    return {
      mine,
      label: mine ? 'あなた' : 'オーナー',
      subLabel: mine ? 'You' : 'Owner',
      avatar: mine ? t('cm_avatarMe') : t('cm_avatarOwner'),
      tone: mine ? 'from-me' : 'from-them',
    };
  }
  return {
    mine,
    label: mine ? 'あなた' : 'ゲスト',
    subLabel: mine ? 'You' : 'Guest',
    avatar: mine ? t('cm_avatarMe') : (senderRole === 'owner' ? t('cm_avatarOwner') : t('cm_avatarGuest')),
    tone: mine ? 'from-me' : 'from-them',
  };
}

export default function ChatModal({ open, onClose, vehicle, currentUser, targetLang = 'ja' }) {
  const { dispatch } = useApp();
  const { t } = useI18n();
  const [conversationId, setConversationId] = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [sending,        setSending]        = useState(false);
  const [showOriginal,   setShowOriginal]   = useState({}); // { msgId: true/false }
  const [autoTranslate,  setAutoTranslate]  = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('user_autotrans') !== 'false';
  });

  const toggleAutoTranslate = () => {
    const next = !autoTranslate;
    setAutoTranslate(next);
    if (typeof window !== 'undefined') localStorage.setItem('user_autotrans', String(next));
  };
  const bottomRef = useRef(null);
  const subRef    = useRef(null);

  // ── 会話の取得 or 作成 ──────────────────────────────────────────
  const initConversation = useCallback(async () => {
    if (!vehicle?.id || !currentUser?.id || !vehicle?.ownerId) return;
    setLoading(true);
    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId:    vehicle.id,
          userId:       currentUser.role === 'owner' ? vehicle.ownerId : currentUser.id,
          ownerUserId:  vehicle.ownerId,
        }),
      });
      const conv = await res.json();
      if (!res.ok || !conv.id) throw new Error(conv.error ?? t('cm_errStartChat'));
      setConversationId(conv.id);
      return conv.id;
    } catch (e) {
      console.error(e);
      dispatch({ type: 'TOAST', msg: e.message ?? t('cm_errStartChat') });
      return null;
    }
    finally { setLoading(false); }
  }, [vehicle?.id, currentUser?.id, vehicle?.ownerId, currentUser?.role, dispatch, t]);

  useEffect(() => { if (open) initConversation(); }, [open, initConversation]);

  // ── メッセージ取得（翻訳付き）──────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const res  = await fetch(`/api/chat/${conversationId}?targetLang=${targetLang}`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
  }, [conversationId, targetLang]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── 開いたら相手のメッセージを既読にする（未読バッジ／通知を止める）──
  useEffect(() => {
    if (!conversationId || !currentUser?.id) return;
    fetch(`/api/chat/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readerId: currentUser.id }),
    }).then(() => {
      if (typeof window !== 'undefined') window.__clearUnread?.();
    }).catch(() => {});
  }, [conversationId, currentUser?.id, messages.length]);

  // ── Supabase Realtime 購読 ─────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    // 既存チャンネルを解除
    if (subRef.current) supabase.removeChannel(subRef.current);

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        const newMsg = payload.new;
        // 自分の送信は既に追加済みなのでスキップ
        if (newMsg.sender_id === currentUser?.id) return;
        // 翻訳
        let translated = null;
        if (newMsg.detected_lang && newMsg.detected_lang !== targetLang) {
          try {
            const r = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: newMsg.content, targetLang, sourceLang: newMsg.detected_lang }),
            });
            const d = await r.json();
            translated = d.translated;
          } catch {}
        }
        setMessages(prev => [...prev, {
          ...newMsg,
          translated_content: translated,
          is_translated: !!translated,
        }]);
      })
      .subscribe();

    subRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, currentUser?.id, targetLang]);

  // ── 自分への Broadcast 通知も購読（オーナーからの返信を即受信）──
  useEffect(() => {
    if (!currentUser?.id) return;
    const ch = supabase
      .channel(`notify:${currentUser.id}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        // 同じ会話なら即ロード
        if (payload.payload?.conversationId === conversationId) {
          loadMessages();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser?.id, conversationId]);

  // ── 自動スクロール ─────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 送信 ───────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const activeConversationId = conversationId ?? await initConversation();
    if (!activeConversationId) {
      setInput(text);
      setSending(false);
      return;
    }

    // 楽観的UI追加
    const detectedLang = detectLanguage(text, targetLang);
    const optimistic = {
      id:                `opt-${Date.now()}`,
      conversation_id:   activeConversationId,
      sender_id:         currentUser.id,
      sender_role:       currentUser.role === 'owner' ? 'owner' : 'user',
      content:           text,
      detected_lang:     detectedLang,
      translated_content: null,
      is_translated:     false,
      created_at:        new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/chat/${activeConversationId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId:    currentUser.id,
          senderRole:  currentUser.role === 'owner' ? 'owner' : 'user',
          content:     text,
          detectedLang,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? t('cm_errSendMsg'));
    } catch (e) {
      console.error(e);
      setMessages(prev => prev.filter(msg => msg.id !== optimistic.id));
      setInput(text);
      dispatch({ type: 'TOAST', msg: e.message ?? t('cm_errSendMsg') });
    }
    finally { setSending(false); }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!open) return null;

  const viewerRole = currentUser?.role === 'owner' ? 'owner' : 'user';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* チャットウィンドウ */}
      <div className="relative w-full sm:w-[420px] h-[92vh] sm:h-[600px] bg-gray-950 border border-gray-800 sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          {vehicle?.img_url ? (
            <img src={vehicle.img_url} alt="" className="w-10 h-10 object-cover rounded-xl flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-lg flex-shrink-0">🚗</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {vehicle?.maker} {vehicle?.model}
            </p>
            <p className="text-gray-500 text-xs flex items-center gap-2">
              <button onClick={toggleAutoTranslate}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${autoTranslate ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                <span className={autoTranslate ? 'text-green-400' : 'text-gray-600'}>●</span>
                {autoTranslate ? t('cm_autoTransOn') : t('cm_autoTransOff')}
              </button>
              <span className="text-purple-400">{LANG_LABEL[targetLang]}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl transition-colors flex-shrink-0">×</button>
        </div>

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 text-sm">{t('cm_loading')}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="text-4xl">💬</div>
              <p className="text-gray-400 text-sm text-center">
                {t('cm_noMessages')}<br />
                <span className="text-gray-500 text-xs">{t('cm_noMessagesSub')}</span>
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const meta = chatParticipantMeta(msg, viewerRole, currentUser?.id, t);
              const mine = meta.mine;
              const roleLabel = meta.label;
              const showOrig = showOriginal[msg.id];
              const displayText = (msg.is_translated && !showOrig && autoTranslate)
                ? msg.translated_content
                : msg.content;

              return (
                <div key={msg.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-black text-sky-200 ring-1 ring-slate-700">
                      {meta.avatar}
                    </div>
                  )}
                  <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                      <span className={`text-[11px] font-black ${mine ? 'text-purple-200' : 'text-sky-200'}`}>{roleLabel}</span>
                      <span className="text-[10px] font-semibold text-gray-600">{meta.subLabel}</span>
                    </div>
                    {/* バブル */}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      mine
                        ? 'bg-purple-600 text-white rounded-br-md'
                        : 'bg-gray-800 text-gray-100 rounded-bl-md'
                    }`}>
                      {displayText}
                    </div>

                    {/* 翻訳バッジ + 原文表示トグル */}
                    <div className={`flex items-center gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-gray-600 text-xs">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.is_translated && (
                        <button
                          onClick={() => setShowOriginal(p => ({ ...p, [msg.id]: !showOrig }))}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          {showOrig ? t('cm_showTranslation') : t('cm_showOriginal')}
                        </button>
                      )}
                    </div>
                  </div>
                  {mine && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-black text-white ring-2 ring-purple-400/30">
                      {meta.avatar}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力エリア */}
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('cm_inputPlaceholder')}
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-purple-500 placeholder-gray-500"
              style={{ maxHeight: '120px' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending || loading}
              className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 flex items-center justify-center transition-all flex-shrink-0"
            >
              {sending ? (
                <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-gray-600 text-xs mt-1.5 text-center">
            {t('cm_autoTransNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
