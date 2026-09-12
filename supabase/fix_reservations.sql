-- ── reservations テーブル修正 ─────────────────────────────────────
-- 不足カラムを追加
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS owner_id              UUID,
  ADD COLUMN IF NOT EXISTS review_deadline       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_enabled        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS guest_name            TEXT,
  ADD COLUMN IF NOT EXISTS guest_email           TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone           TEXT,
  ADD COLUMN IF NOT EXISTS guest_booking_token   TEXT,
  ADD COLUMN IF NOT EXISTS contact_handles       JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS idp_file_name         TEXT,
  ADD COLUMN IF NOT EXISTS idp_expires_on        TEXT,
  ADD COLUMN IF NOT EXISTS drive_pass_id         TEXT,
  ADD COLUMN IF NOT EXISTS one_way_location_id   TEXT,
  ADD COLUMN IF NOT EXISTS one_way_fee           INT DEFAULT 0;

-- user_id のFK制約を削除（auth.users と連携するため）
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_user_id_fkey;

-- RLSを無効化（APIサーバーから保存できるように）
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_user_id    ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_owner_id   ON reservations(owner_id);
CREATE INDEX IF NOT EXISTS idx_reservations_vehicle_id ON reservations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status     ON reservations(status);

-- 既存の vehicles テーブルの approval_status カラムを追加（未実施の場合）
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS license_plate TEXT,
  ADD COLUMN IF NOT EXISTS inspection_cert_url TEXT,
  ADD COLUMN IF NOT EXISTS insurance_cert_url TEXT;

-- 既存の管理者登録車両を承認済みに
UPDATE vehicles SET approval_status = 'approved' WHERE owner_id IS NULL;
UPDATE vehicles SET approval_status = 'approved' WHERE approval_status = 'pending' AND owner_id IS NOT NULL AND id IN (
  SELECT id FROM vehicles WHERE created_at < NOW() - INTERVAL '1 day'
);
