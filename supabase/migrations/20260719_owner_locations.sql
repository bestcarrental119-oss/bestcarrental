-- オーナーの拠点住所（Best One-Way の出発/返却地に使う）
CREATE TABLE IF NOT EXISTS owner_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID,
  owner_auth_id UUID,
  label         TEXT,
  address       TEXT NOT NULL,
  lat           NUMERIC(10,6),
  lng           NUMERIC(10,6),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS owner_locations_owner_idx ON owner_locations(owner_id);
CREATE INDEX IF NOT EXISTS owner_locations_auth_idx  ON owner_locations(owner_auth_id);

-- サーバー（service role）経由のみアクセス。公開ポリシーは作らない。
ALTER TABLE owner_locations ENABLE ROW LEVEL SECURITY;
