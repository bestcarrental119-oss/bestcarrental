-- ============================================================
-- Owners / Stores テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS owners (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 基本情報
  applicant_name      TEXT,
  store_name          TEXT NOT NULL,
  store_location      TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,

  -- 事業形態: 'individual' | 'corporation' | 'additional_store'
  business_type       TEXT NOT NULL CHECK (business_type IN ('individual', 'corporation', 'additional_store')),

  -- 個人の場合のみ
  id_document_url     TEXT,                -- 身分証明書

  -- 法人の場合のみ
  corp_address        TEXT,                -- 法人住所
  corp_registry_url   TEXT,                -- 登記謄本

  -- 許認可・財務情報
  rental_permit_url   TEXT,                -- レンタカー許可証
  invoice_number      TEXT,                -- インボイス番号（適格請求書）

  -- 銀行口座情報
  bank_name           TEXT,
  bank_branch         TEXT,
  bank_account_type   TEXT CHECK (bank_account_type IN ('ordinary', 'checking', 'savings')),
  bank_account_number TEXT,
  bank_account_holder TEXT,

  -- 審査ステータス: 'pending' | 'approved' | 'rejected'
  status              TEXT NOT NULL DEFAULT 'pending',
  rejection_reason    TEXT,

  -- 関連ユーザー
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_owner_id     UUID REFERENCES owners(id) ON DELETE SET NULL,
  pre_booking_chat_enabled BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS pre_booking_chat_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applicant_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_owner_id UUID REFERENCES owners(id) ON DELETE SET NULL;

ALTER TABLE owners
  DROP CONSTRAINT IF EXISTS owners_business_type_check;

ALTER TABLE owners
  ADD CONSTRAINT owners_business_type_check
  CHECK (business_type IN ('individual', 'corporation', 'additional_store'));

UPDATE owners
SET applicant_name = store_name
WHERE applicant_name IS NULL;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_owners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS owners_updated_at ON owners;
CREATE TRIGGER owners_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE FUNCTION update_owners_updated_at();

-- RLS
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

-- サービスロールは全操作可能
CREATE POLICY "Service role full access owners"
  ON owners FOR ALL
  USING (true);

-- Supabase Storage: owner-docs バケット（非公開）
-- Supabase ダッシュボード > Storage から手動で作成してください:
--   バケット名: owner-docs
--   Public: OFF（非公開）
