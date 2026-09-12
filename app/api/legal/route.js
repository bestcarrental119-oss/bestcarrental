// /api/legal — 法的ページ（プライバシー/利用規約/お問い合わせ）の取得・保存
// 管理者バックエンドから編集可能。多言語対応。
import { NextResponse } from 'next/server';
import { getLegalPages, saveLegalPages } from '../../../lib/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pages = await getLegalPages();
    return NextResponse.json(pages);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const patch = await req.json();
    const next = await saveLegalPages(patch);
    return NextResponse.json(next);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
