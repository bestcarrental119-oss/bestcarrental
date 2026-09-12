-- ============================================================
--  Renter block list — オーナー/加盟店が特定の利用者をブロック
--  Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS renter_blocks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL,               -- 加盟店オーナー (owners.id)
  user_id     UUID NOT NULL,               -- ブロック対象の利用者 (users.id)
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_renter_blocks_owner ON renter_blocks(owner_id);
CREATE INDEX IF NOT EXISTS idx_renter_blocks_user  ON renter_blocks(user_id);

ALTER TABLE renter_blocks ENABLE ROW LEVEL SECURITY;

-- サービスロール（API層）でのみ操作。RLSはanon経由の直接アクセスを遮断。
DROP POLICY IF EXISTS "Service role full access renter_blocks" ON renter_blocks;
CREATE POLICY "Service role full access renter_blocks"
  ON renter_blocks FOR ALL
  USING (true);
