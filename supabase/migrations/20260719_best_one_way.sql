-- Best One-Way（片道GO）— 回送車両のマッチング
-- 乗り捨てられた車を、格安でユーザーに運転して戻してもらう募集リスト。

CREATE TABLE IF NOT EXISTS one_way_listings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id       UUID,
  owner_auth_id  UUID,
  vehicle_id     UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  maker          TEXT,
  model          TEXT,
  cls            TEXT,
  img_url        TEXT,
  from_name      TEXT NOT NULL,            -- 出発店舗（今、車がある場所）
  from_lat       NUMERIC(10,6),
  from_lng       NUMERIC(10,6),
  to_name        TEXT NOT NULL,            -- 返却店舗（戻す先）
  to_lat         NUMERIC(10,6),
  to_lng         NUMERIC(10,6),
  distance_km    NUMERIC(8,1) DEFAULT 0,
  base_price     INT DEFAULT 0,            -- 貸出基本料金（0円も可）
  deadline_at    TIMESTAMPTZ,             -- 返却期限
  available_from TIMESTAMPTZ DEFAULT NOW(),-- 募集開始（未来ならピン青＝予定）
  insurance_plans TEXT[] DEFAULT ARRAY['waiver','waiverPlus','perfect']::TEXT[],
  status         TEXT DEFAULT 'open',      -- open | reserved | closed
  reserved_by    UUID,
  reservation_id TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS one_way_listings_status_idx ON one_way_listings(status);

-- ルートアラート（希望ルートの募集開始を通知）
CREATE TABLE IF NOT EXISTS one_way_route_alerts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID,
  email       TEXT,
  from_area   TEXT NOT NULL,
  to_area     TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE one_way_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_way_route_alerts ENABLE ROW LEVEL SECURITY;

-- 公開中の募集は誰でも閲覧可（書き込みは service role のみ = サーバー経由）
DROP POLICY IF EXISTS "public read open one-way" ON one_way_listings;
CREATE POLICY "public read open one-way"
  ON one_way_listings FOR SELECT
  USING (status = 'open');
