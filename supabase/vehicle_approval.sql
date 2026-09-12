-- vehicles テーブルに審査ステータスを追加
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS license_plate TEXT,
  ADD COLUMN IF NOT EXISTS inspection_cert_url TEXT,
  ADD COLUMN IF NOT EXISTS insurance_cert_url TEXT;

-- 既存の管理者が登録した車両は自動承認
UPDATE vehicles SET approval_status = 'approved' WHERE owner_id IS NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_vehicles_approval_status ON vehicles(approval_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_id ON vehicles(owner_id);
