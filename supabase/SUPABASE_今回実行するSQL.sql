-- ============================================================================
-- Best Car Rental — 今回の追加ぶん Supabase マイグレーション
-- Supabase → SQL Editor に丸ごと貼り付けて Run してください。
-- すべて IF NOT EXISTS 等なので、何度実行しても安全です。
-- ============================================================================

-- gen_random_uuid() 用（通常は有効ですが念のため）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 補償プラン（利用者が選ぶ免責補償／オーナーが提供プランを選択）
--    無料の basic は常に表示。paid = {waiver, waiverPlus, perfect} の部分集合。
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_plans TEXT[]
    DEFAULT ARRAY['waiver','waiverPlus','perfect']::TEXT[];

COMMENT ON COLUMN vehicles.insurance_plans IS
  '利用者に提供する有料補償プラン。{waiver, waiverPlus, perfect} の部分集合。無料の basic は常に表示。NULL は全プラン提供。';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Best One-Way（片道GO）— 回送車両マッチング
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS one_way_listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID,
  owner_auth_id  UUID,
  vehicle_id     UUID,
  maker TEXT, model TEXT, cls TEXT, img_url TEXT,
  from_name TEXT NOT NULL, from_lat NUMERIC(10,6), from_lng NUMERIC(10,6),
  to_name   TEXT NOT NULL, to_lat   NUMERIC(10,6), to_lng   NUMERIC(10,6),
  distance_km NUMERIC(8,1) DEFAULT 0,
  base_price INT DEFAULT 0,
  deadline_at TIMESTAMPTZ,
  available_from TIMESTAMPTZ DEFAULT NOW(),
  insurance_plans TEXT[] DEFAULT ARRAY['waiver','waiverPlus','perfect']::TEXT[],
  status TEXT DEFAULT 'open',              -- open | reserved | closed
  reserved_by UUID, reservation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS one_way_listings_status_idx ON one_way_listings(status);

ALTER TABLE one_way_listings
  ADD COLUMN IF NOT EXISTS custody_status TEXT DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS home_owner_id UUID,
  ADD COLUMN IF NOT EXISTS current_owner_id UUID,
  ADD COLUMN IF NOT EXISTS route_policy TEXT,
  ADD COLUMN IF NOT EXISTS source_cross_return_id UUID,
  ADD COLUMN IF NOT EXISTS service_owner_id UUID,
  ADD COLUMN IF NOT EXISTS service_fee_total INT DEFAULT 0;

COMMENT ON COLUMN one_way_listings.custody_status IS
  'received/ready の車だけ検索・予約可能。in_transit/handover_pending/pending_received は非公開・予約不可。';

CREATE INDEX IF NOT EXISTS one_way_listings_custody_status_idx ON one_way_listings(custody_status);

CREATE TABLE IF NOT EXISTS one_way_route_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, email TEXT,
  from_area TEXT NOT NULL, to_area TEXT NOT NULL,
  active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS（公開中の募集は誰でも閲覧可。書き込みは service role = サーバー経由のみ）
ALTER TABLE one_way_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_way_route_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read open one-way" ON one_way_listings;
CREATE POLICY "public read open one-way"
  ON one_way_listings FOR SELECT USING (status = 'open');

-- 完了！

-- ────────────────────────────────────────────────────────────────────────────
-- P) オーナー拠点住所（Best One-Way の出発/返却地に使用）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID, owner_auth_id UUID,
  label TEXT, address TEXT NOT NULL,
  lat NUMERIC(10,6), lng NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS owner_locations_owner_idx ON owner_locations(owner_id);
CREATE INDEX IF NOT EXISTS owner_locations_auth_idx  ON owner_locations(owner_auth_id);
ALTER TABLE owner_locations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- Q) セーフティ機能：¥0事前オーソリ記録 / AI損傷チェック
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS preauth_mode TEXT,
  ADD COLUMN IF NOT EXISTS preauth_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS damage_inspections (
  reservation_id TEXT PRIMARY KEY,
  photos   JSONB DEFAULT '{}'::jsonb,
  analysis JSONB,
  est_cost INT DEFAULT 0,
  mode     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE damage_inspections ENABLE ROW LEVEL SECURITY;

-- オーナー既定の事前オーソリ方式（¥0 / ¥1）
ALTER TABLE owners ADD COLUMN IF NOT EXISTS preauth_mode TEXT DEFAULT 'zero';

-- ────────────────────────────────────────────────────────────────────────────
-- R) 予約前チャット：オーナーが許可した車だけ車両カードから質問可能
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS pre_booking_chat_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_owners_pre_booking_chat_enabled
  ON owners(pre_booking_chat_enabled);

-- ────────────────────────────────────────────────────────────────────────────
-- S) Best Go：他社拠点で受領後、ホームへ戻す方法を管理
--    staff = スタッフ回送 / best_one_way = Best One Wayでユーザーに戻してもらう
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE cross_returns
  ADD COLUMN IF NOT EXISTS home_return_method TEXT DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS home_return_status TEXT DEFAULT 'holding',
  ADD COLUMN IF NOT EXISTS home_return_one_way_listing_id UUID,
  ADD COLUMN IF NOT EXISTS home_return_reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS home_return_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS home_return_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN cross_returns.home_return_method IS
  'undecided/staff/best_one_way。受領後に車をホーム拠点へ戻す方法。';

COMMENT ON COLUMN cross_returns.home_return_status IS
  'holding/staff_requested/one_way_requested/staff_returning/one_way_listed/one_way_booked/one_way_returning/returned_home。';

CREATE INDEX IF NOT EXISTS cross_returns_home_return_status_idx
  ON cross_returns(home_return_status);

CREATE INDEX IF NOT EXISTS cross_returns_home_return_listing_idx
  ON cross_returns(home_return_one_way_listing_id);

NOTIFY pgrst, 'reload schema';
