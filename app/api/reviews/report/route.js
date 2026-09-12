/**
 * POST /api/reviews/report
 * 加盟店オーナーが不当なレビューを運営本部へ報告する。
 * オーナーは削除・編集不可。報告のみ可能。
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export async function POST(req) {
  try {
    const { reviewId, reportReason, reportedBy } = await req.json();

    if (!reviewId || !reportReason) {
      return NextResponse.json(
        { error: 'reviewId and reportReason are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update({
        reported:      true,
        report_reason: reportReason,
        reported_at:   new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select()
      .single();

    if (error) throw error;

    // TODO: 運営へのメール通知（SendGrid等）を追加可能
    console.log(`[review/report] Review ${reviewId} reported by ${reportedBy}: ${reportReason}`);

    return NextResponse.json({ success: true, review: data });
  } catch (e) {
    console.error('[reviews/report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
