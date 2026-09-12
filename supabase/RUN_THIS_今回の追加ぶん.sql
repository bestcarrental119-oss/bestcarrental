-- ============================================================================
-- BEST Car Rental — この会話で追加した機能ぶんの Supabase マイグレーション
-- Supabase → SQL Editor に丸ごと貼り付けて実行してください。
-- すべて IF NOT EXISTS なので、既存の環境でも安全に再実行できます。
-- ============================================================================

-- gen_random_uuid() 用（Supabaseは通常有効ですが念のため）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 決済まわり（7日前オーソリ、貸出時Capture、キャンセル料Captureが依存する列）
--    payment_status は none / scheduled / authorized / paid /
--    cancel_fee_captured / released / failed / refunded を使います。
--    未導入の環境向けの保険。既にあればスキップ。
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS stripe_customer_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_paid_amount        INTEGER,
  ADD COLUMN IF NOT EXISTS charge_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status            TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS charge_attempts           INT  DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_reservations_charge_due
  ON reservations (payment_status, charge_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) キャンセル自動返金（ポリシー準拠）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancel_fee        INTEGER,
  ADD COLUMN IF NOT EXISTS refund_amount     INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_refund_id  TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) IDPペーパーレス受取（QRパス）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS pickup_token           TEXT,
  ADD COLUMN IF NOT EXISTS pickup_pass_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idp_snapshot           JSONB,
  ADD COLUMN IF NOT EXISTS pickup_verified_at     TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_pickup_token
  ON reservations (pickup_token) WHERE pickup_token IS NOT NULL;

-- オーナーが読み取って保存する受取記録（印刷/CSV/画像の元データ）
CREATE TABLE IF NOT EXISTS owner_pickup_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         TEXT NOT NULL,
  reservation_id   TEXT NOT NULL,
  token            TEXT,
  renter_name      TEXT,
  nat              TEXT,
  reservation_info JSONB,
  documents        JSONB,
  scanned_at       TIMESTAMPTZ DEFAULT now(),
  purge_after      TIMESTAMPTZ,        -- 返却日 + 30日で自動削除
  UNIQUE (owner_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_pickup_records_owner
  ON owner_pickup_records (owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_pickup_records_purge
  ON owner_pickup_records (purge_after);

-- 完了！

-- ────────────────────────────────────────────────────────────────────────────
-- N) 補償プラン（利用者が選ぶ免責補償の4段階／オーナーが提供プランを選択）
--    basic は常に無料で表示。paid = {waiver, waiverPlus, perfect} の部分集合。
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_plans TEXT[]
    DEFAULT ARRAY['waiver','waiverPlus','perfect']::TEXT[];

COMMENT ON COLUMN vehicles.insurance_plans IS
  '利用者に提供する有料補償プラン。{waiver, waiverPlus, perfect} の部分集合。無料の basic は常に表示。NULL は全プラン提供。';

-- ────────────────────────────────────────────────────────────────────────────
-- O) Best One-Way（片道GO）— 回送車両マッチング
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
  status TEXT DEFAULT 'open',
  reserved_by UUID, reservation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS one_way_listings_status_idx ON one_way_listings(status);

CREATE TABLE IF NOT EXISTS one_way_route_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, email TEXT,
  from_area TEXT NOT NULL, to_area TEXT NOT NULL,
  active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE one_way_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_way_route_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read open one-way" ON one_way_listings;
CREATE POLICY "public read open one-way" ON one_way_listings FOR SELECT USING (status = 'open');

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
