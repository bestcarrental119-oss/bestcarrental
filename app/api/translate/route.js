/**
 * POST /api/translate  { text, targetLang }
 * LibreTranslate（無料・登録不要）で翻訳。
 * 失敗時は MyMemory API（バックアップ）にフォールバック。
 */
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// LibreTranslate の言語コードマッピング
const LIBRE_LANG = {
  'ja':    'ja',
  'en':    'en',
  'zh-TW': 'zh',
  'zh-CN': 'zh',
  'ko':    'ko',
};

// MyMemory の言語コードマッピング（バックアップ用）
const MYMEMORY_LANG = {
  'ja':    'ja',
  'en':    'en',
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  'ko':    'ko',
};

// LibreTranslate 公開インスタンス（無料）
const LIBRE_ENDPOINTS = [
  'https://translate.argosopentech.com/translate',
  'https://libretranslate.de/translate',
];

function detectLanguage(text) {
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'auto';
}

async function translateWithLibre(text, sourceLang, targetLang) {
  const src = LIBRE_LANG[sourceLang] ?? 'auto';
  const tgt = LIBRE_LANG[targetLang] ?? 'en';

  for (const endpoint of LIBRE_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' }),
        signal: AbortSignal.timeout(5000), // 5秒タイムアウト
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.translatedText) return data.translatedText;
    } catch { continue; }
  }
  return null;
}

// Google Cloud Translation API v2 — primary provider when a key is configured.
// Enable "Cloud Translation API" in Google Cloud and set GOOGLE_TRANSLATE_API_KEY.
const GOOGLE_LANG = { 'ja': 'ja', 'en': 'en', 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', 'ko': 'ko' };
async function translateWithGoogle(text, sourceLang, targetLang) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  const target = GOOGLE_LANG[targetLang] ?? 'en';
  const source = sourceLang && sourceLang !== 'auto' ? (GOOGLE_LANG[sourceLang] ?? undefined) : undefined;
  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target, format: 'text', ...(source ? { source } : {}) }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.translations?.[0]?.translatedText ?? null;
  } catch { return null; }
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
  const src = MYMEMORY_LANG[sourceLang] ?? 'en';
  const tgt = MYMEMORY_LANG[targetLang] ?? 'ja';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.responseStatus === 200) return data.responseData.translatedText;
  } catch {}
  return null;
}

export async function POST(req) {
  try {
    const { text, targetLang, sourceLang: rawSourceLang = 'auto' } = await req.json();
    if (!text || !targetLang) return NextResponse.json({ translated: text ?? '' });
    const sourceLang = rawSourceLang === 'auto' ? detectLanguage(text) : rawSourceLang;

    // 同じ言語なら翻訳不要
    if (sourceLang !== 'auto' && sourceLang === targetLang) {
      return NextResponse.json({ translated: text, skipped: true });
    }

    // ① Google Cloud Translation（APIキーがあれば最優先・高品質）
    let translated = await translateWithGoogle(text, sourceLang, targetLang);

    // ② LibreTranslate（無料）にフォールバック
    if (!translated) {
      translated = await translateWithLibre(text, sourceLang, targetLang);
    }

    // ③ MyMemory（無料）にさらにフォールバック
    if (!translated) {
      translated = await translateWithMyMemory(text, sourceLang, targetLang);
    }

    // ④ すべて失敗したら原文をそのまま返す
    return NextResponse.json({ translated: translated ?? text });
  } catch (e) {
    console.error('[translate]', e.message);
    return NextResponse.json({ translated: '', error: e.message }, { status: 500 });
  }
}
