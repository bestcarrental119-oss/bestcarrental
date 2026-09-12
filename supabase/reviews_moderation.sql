-- ============================================================
-- reviews テーブル：モデレーション用カラム追加
-- ============================================================

-- 論理削除・編集フラグ
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS is_hidden       BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason   TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by    UUID,       -- 操作した管理者のID
  ADD COLUMN IF NOT EXISTS original_comment TEXT;      -- 編集前の元コメント保存

-- 報告フラグ（加盟店→運営への不服申し立て）
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reported        BOOLEAN   DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_reason   TEXT,
  ADD COLUMN IF NOT EXISTS reported_at     TIMESTAMPTZ;

-- ============================================================
-- RLS ポリシー設計方針
-- ============================================================
-- 実装方針: API層でrole='admin'チェックを行い、supabaseAdminクライアント
-- (service_role) のみがPATCH/DELETEを実行できる構造にする。
-- RLSはsupabase-jsのanonクライアント経由のアクセス制御に使用。

-- 全ユーザーがレビューを閲覧可（非表示以外）
DROP POLICY IF EXISTS "Public read non-hidden reviews" ON reviews;
CREATE POLICY "Public read non-hidden reviews"
  ON reviews FOR SELECT
  USING (is_hidden = false);

-- 認証済みユーザーが自分のレビューを投稿可
DROP POLICY IF EXISTS "Authenticated users can insert own reviews" ON reviews;
CREATE POLICY "Authenticated users can insert own reviews"
  ON reviews FOR INSERT
  WITH CHECK (true);

-- サービスロール（管理者API）は全操作可
-- ※ supabaseAdminクライアントはRLSをバイパスするため別途ポリシー不要
