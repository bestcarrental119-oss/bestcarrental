-- ============================================================
-- 1. vehicles に owner_id カラムを追加（加盟店との紐付け）
-- ============================================================
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id) ON DELETE SET NULL;

-- ============================================================
-- 2. store_addons テーブル（加盟店別付加サービス）
-- ============================================================
CREATE TABLE IF NOT EXISTS store_addons (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 加盟店または全体管理者（owner_id が NULL = プラットフォーム共通）
  owner_id    UUID REFERENCES owners(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,             -- 表示名 例: "チャイルドシート"
  description TEXT,                      -- 補足説明
  icon        TEXT DEFAULT '⚙️',          -- 絵文字アイコン
  price       INT  NOT NULL DEFAULT 0,   -- 金額（円）
  -- 'flat' = 1回固定 / 'per_day' = 日数×
  price_type  TEXT NOT NULL DEFAULT 'per_day'
                CHECK (price_type IN ('flat', 'per_day')),

  is_active   BOOLEAN DEFAULT true,
  sort_order  INT     DEFAULT 0,         -- 表示順

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_store_addons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_addons_updated_at ON store_addons;
CREATE TRIGGER store_addons_updated_at
  BEFORE UPDATE ON store_addons
  FOR EACH ROW EXECUTE FUNCTION update_store_addons_updated_at();

-- RLS
ALTER TABLE store_addons ENABLE ROW LEVEL SECURITY;

-- 公開読み取り（アクティブのみ）
CREATE POLICY "Public read active addons"
  ON store_addons FOR SELECT
  USING (is_active = true);

-- サービスロール（管理者API）は全操作可
-- supabaseAdmin クライアントは RLS をバイパスするため追加ポリシー不要

-- ============================================================
-- 3. サンプルデータ（動作確認用 / 全加盟店共通デフォルト）
-- ============================================================
INSERT INTO store_addons (owner_id, name, description, icon, price, price_type, sort_order) VALUES
  (NULL, 'ベーシック保険',    '対人・対物補償付き基本保険',       '🛡', 1100, 'per_day', 1),
  (NULL, 'ETCカード',         '高速道路ETC利用カード（貸出）',    '🛣',  330, 'flat',    2),
  (NULL, 'チャイルドシート',  'ISO FIX対応チャイルドシート',      '👶',  550, 'per_day', 3)
ON CONFLICT DO NOTHING;
