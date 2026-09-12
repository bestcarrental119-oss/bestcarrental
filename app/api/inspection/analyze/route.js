/**
 * POST /api/inspection/analyze  { reservationId }
 * 保存済みの「貸出前 / 返却後」写真を AI で比較し、新たな損傷と推定修理費を返す。
 * OPENAI_API_KEY があれば OpenAI(gpt-4o)、無ければ ANTHROPIC_API_KEY で Claude。
 * どちらも無ければ { manual:true } を返し、UI 側で手動記録に切り替える。
 */
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const PROMPT = `You are a vehicle damage assessor. You are given BEFORE (at departure) and AFTER (at return) photos of the SAME car, grouped by position. The positions are: front_left, front, front_right, rear_right, rear, rear_left (exterior 3/4 and straight views), windshield, meter (odometer/dashboard), front_seats, rear_seats (interior). Compare the SAME position's BEFORE vs AFTER and identify ONLY NEW damage that appears in AFTER but not in BEFORE (scratches, dents, cracks, chips, stains, tears, burns). Ignore lighting/reflection differences and dirt that is not damage. Estimate a realistic repair cost in Japanese yen per item. Respond with STRICT JSON only, no prose:
{"items":[{"angle":"one of the position ids above","type":"scratch|dent|crack|chip|stain|tear|burn|other","location":"short text","severity":"minor|moderate|severe","estimatedRepairJPY":number}],"totalJPY":number,"newDamage":boolean,"summary":"one short sentence"}
If there is no new damage, return {"items":[],"totalJPY":0,"newDamage":false,"summary":"No new damage detected"}.`;

function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  // ```json ... ``` フェンスを除去
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fallthrough */ } }
  return null;
}

async function analyzeOpenAI(pairs) {
  const content = [{ type: 'text', text: PROMPT }];
  pairs.forEach(p => {
    content.push({ type: 'text', text: `--- Angle: ${p.angle} — BEFORE ---` });
    content.push({ type: 'image_url', image_url: { url: p.before } });
    content.push({ type: 'text', text: `--- Angle: ${p.angle} — AFTER ---` });
    content.push({ type: 'image_url', image_url: { url: p.after } });
  });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 900,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI error');
  return extractJson(data.choices?.[0]?.message?.content);
}

async function analyzeAnthropic(pairs) {
  const content = [{ type: 'text', text: PROMPT }];
  pairs.forEach(p => {
    const parse = (u) => { const m = /^data:(.+?);base64,(.*)$/.exec(u || ''); return m ? { media: m[1], data: m[2] } : null; };
    const b = parse(p.before), a = parse(p.after);
    content.push({ type: 'text', text: `--- Angle: ${p.angle} — BEFORE ---` });
    if (b) content.push({ type: 'image', source: { type: 'base64', media_type: b.media, data: b.data } });
    content.push({ type: 'text', text: `--- Angle: ${p.angle} — AFTER ---` });
    if (a) content.push({ type: 'image', source: { type: 'base64', media_type: a.media, data: a.data } });
  });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: 900,
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Anthropic error');
  return extractJson(data.content?.[0]?.text);
}

async function analyzeGemini(pairs) {
  const parts = [{ text: PROMPT }];
  pairs.forEach(p => {
    const parse = (u) => { const m = /^data:(.+?);base64,(.*)$/.exec(u || ''); return m ? { media: m[1], data: m[2] } : null; };
    const b = parse(p.before), a = parse(p.after);
    parts.push({ text: `--- Angle: ${p.angle} — BEFORE ---` });
    if (b) parts.push({ inline_data: { mime_type: b.media, data: b.data } });
    parts.push({ text: `--- Angle: ${p.angle} — AFTER ---` });
    if (a) parts.push({ inline_data: { mime_type: a.media, data: a.data } });
  });
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  // 現行GA・画像対応モデル（2026）。GEMINI_VISION_MODEL で上書き可。
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash';
  // 「思考」で出力枠を使い切ると本文が空になるため最小化する。
  // Gemini 3系は thinkingLevel、2.5系は thinkingBudget を使う。
  const thinkingConfig = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    // 新形式(AQ.)キーでも確実に通るよう、ヘッダーでもキーを渡す
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        // 思考で枠を消費しても本文JSONが切れないよう大きめに確保
        maxOutputTokens: 8192,
        thinkingConfig,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini error (${res.status})`);
  const cand = data.candidates?.[0];
  // 回答は複数パーツに分割されることがある。思考パーツ(thought)を除外し、
  // 改行を挟まず「そのまま連結」して元のJSONを復元する（\n連結だと壊れる）。
  const text = (cand?.content?.parts ?? [])
    .filter(p => p && typeof p.text === 'string' && !p.thought)
    .map(p => p.text)
    .join('');
  if (!text) throw new Error(`Gemini empty output (finishReason: ${cand?.finishReason ?? 'unknown'})`);
  const parsed = extractJson(text);
  // 解釈できない場合は生の返答（先頭）をエラーに含めて原因を可視化
  if (!parsed) throw new Error(`AI response not JSON [${cand?.finishReason ?? '?'}]: ${text.slice(0, 240)}`);
  return parsed;
}

export async function POST(req) {
  if (!supabaseAdmin) return Response.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const { reservationId, angles } = await req.json();
    if (!reservationId) return Response.json({ error: 'reservationId required' }, { status: 400 });

    // 比較する箇所を指定できる（未指定なら before/after が揃う全箇所）
    const only = Array.isArray(angles) && angles.length > 0 ? new Set(angles.map(String)) : null;

    const { data: row } = await supabaseAdmin.from('damage_inspections').select('*').eq('reservation_id', reservationId).single();
    const photos = row?.photos ?? {};
    const pairs = Object.entries(photos)
      .filter(([pos, v]) => v?.before && v?.after && (!only || only.has(String(pos))))
      .map(([angle, v]) => ({ angle, before: v.before, after: v.after }));

    if (pairs.length === 0) {
      return Response.json({ error: 'need before & after photos for at least one selected spot' }, { status: 400 });
    }

    // 利用可能な AI プロバイダを自動選択（OpenAI → Anthropic → Gemini）
    const providers = [];
    if (process.env.OPENAI_API_KEY) providers.push(() => analyzeOpenAI(pairs));
    if (process.env.ANTHROPIC_API_KEY) providers.push(() => analyzeAnthropic(pairs));
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) providers.push(() => analyzeGemini(pairs));
    if (providers.length === 0) {
      return Response.json({ manual: true });
    }

    let result = null, lastErr = null;
    for (const run of providers) {
      try { result = await run(); if (result) break; } catch (e) { lastErr = e; }
    }
    if (!result) throw lastErr || new Error('AI returned no parseable result');

    const totalJPY = Math.max(0, Math.round(Number(result.totalJPY) || 0));
    await supabaseAdmin.from('damage_inspections').upsert({
      reservation_id: reservationId,
      analysis: result,
      est_cost: totalJPY,
      mode: 'ai',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'reservation_id' });

    return Response.json({ analysis: result, estCost: totalJPY, mode: 'ai' });
  } catch (e) {
    console.error('[inspection/analyze]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
