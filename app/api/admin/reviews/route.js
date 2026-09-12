/**
 * /api/admin/reviews
 *
 * GET    — 全レビュー一覧（店舗・ユーザー情報付き）※管理者のみ
 * PATCH  — レビューコメント編集 or 非表示（論理削除）※管理者のみ
 * DELETE — 完全削除（物理削除）※管理者のみ
 *
 * 権限チェック: リクエストヘッダー X-User-Role: admin を必須とし、
 * supabaseAdmin（service_role）を使って操作する。
 * フロントエンドはログイン済みadminユーザーのみこのエンドポイントを呼び出す。
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

// ── 権限チェックヘルパー ──────────────────────────────────────
function assertAdmin(req) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') {
    throw Object.assign(new Error('Forbidden: admin only'), { status: 403 });
  }
}

// ── GET — 全レビュー取得 ──────────────────────────────────────
export async function GET(req) {
  try {
    assertAdmin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 403 });
  }

  const { searchParams } = new URL(req.url);
  const storeFilter = searchParams.get('store');   // loc でフィルター
  const sortBy      = searchParams.get('sort') ?? 'created_at';  // rating | created_at
  const order       = searchParams.get('order') ?? 'desc';

  try {
    // reviews + reservation + vehicle（店舗情報として loc を使用）
    let query = supabaseAdmin
      .from('reviews')
      .select(`
        *,
        reservations (
          id,
          vehicle_id,
          user_id,
          pickup_at,
          return_at,
          vehicles ( id, maker, model, loc, holder )
        )
      `)
      .order(sortBy, { ascending: order === 'asc' });

    const { data, error } = await query;
    if (error) throw error;

    // 店舗フィルター（vehicle.loc で絞り込み）
    let reviews = data ?? [];
    if (storeFilter) {
      reviews = reviews.filter(r =>
        r.reservations?.vehicles?.loc?.toLowerCase().includes(storeFilter.toLowerCase())
      );
    }

    return NextResponse.json(reviews);
  } catch (e) {
    console.error('[admin/reviews GET]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── PATCH — 編集（コメント書き換え or 非表示）────────────────
export async function PATCH(req) {
  try {
    assertAdmin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 403 });
  }

  try {
    const { id, comment, isHidden, hiddenReason, moderatedBy } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // 編集前の元コメントを保存してから更新
    const { data: existing } = await supabaseAdmin
      .from('reviews')
      .select('comment, original_comment')
      .eq('id', id)
      .single();

    const updates = {
      moderated_at: new Date().toISOString(),
      moderated_by: moderatedBy ?? null,
    };

    if (comment !== undefined) {
      // 初回編集時のみ元コメントを保存
      if (!existing?.original_comment) {
        updates.original_comment = existing?.comment;
      }
      updates.comment = comment;
    }

    if (isHidden !== undefined) {
      updates.is_hidden    = isHidden;
      updates.hidden_reason = hiddenReason ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    console.error('[admin/reviews PATCH]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DELETE — 物理削除 ─────────────────────────────────────────
export async function DELETE(req) {
  try {
    assertAdmin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[admin/reviews DELETE]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
