-- ══════════════════════════════════════════════════════════════════════════
-- 異地还车（オーナー間乗り捨て返却）
--   ・オーナーは「他オーナーの車を自拠点で受け入れる」かをON/OFF
--   ・費用は「保管料（日×額）」または「費用分配（固定/割合）」から選択
--   ・貸出前/返却時の写真をオーナー同士で共有
-- Supabase SQL Editor に貼り付けて実行（何度実行してもOK＝冪等）
-- ══════════════════════════════════════════════════════════════════════════

-- 受け入れ設定（1オーナー=1行）
CREATE TABLE IF NOT EXISTS cross_return_settings (
  owner_id         UUID PRIMARY KEY,
  enabled          BOOLEAN DEFAULT false,   -- 異地还车の受け入れを許可
  location         TEXT,                    -- 受け入れ拠点住所（表示用）
  fee_mode         TEXT DEFAULT 'storage',  -- 'storage'（保管料） | 'split'（費用分配）
  storage_per_day  INT  DEFAULT 0,          -- ¥/日（storage）
  split_type       TEXT DEFAULT 'percent',  -- 'percent' | 'fixed'
  split_value      INT  DEFAULT 50,         -- percent=%、fixed=¥
  note             TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cross_return_settings ENABLE ROW LEVEL SECURITY;

-- 取り決め（1予約=1行）
CREATE TABLE IF NOT EXISTS cross_returns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id      TEXT,
  vehicle_id          UUID,
  origin_owner_id     UUID,        -- 車を貸し出すオーナー
  receiving_owner_id  UUID,        -- 返却を受けるオーナー
  receiving_location  TEXT,
  fee_mode            TEXT,        -- 'storage' | 'split'
  storage_per_day     INT DEFAULT 0,
  days_stored         INT DEFAULT 0,
  split_type          TEXT,
  split_value         INT DEFAULT 0,
  base_fee            INT DEFAULT 0,   -- 車ごとのBest Go基本費用
  fee_total           INT DEFAULT 0,   -- 計算済み合計（¥）
  share_photos        BOOLEAN DEFAULT true,
  status              TEXT DEFAULT 'requested', -- requested|accepted|received|settled|cancelled
  home_return_method  TEXT DEFAULT 'undecided', -- undecided|staff|best_one_way
  home_return_status  TEXT DEFAULT 'holding',   -- holding|staff_requested|one_way_requested|staff_returning|one_way_listed|one_way_booked|one_way_returning|returned_home
  home_return_one_way_listing_id UUID,
  home_return_reservation_id TEXT,
  home_return_started_at TIMESTAMPTZ,
  home_return_completed_at TIMESTAMPTZ,
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cross_returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cross_returns_origin_idx ON cross_returns(origin_owner_id);
CREATE INDEX IF NOT EXISTS cross_returns_recv_idx   ON cross_returns(receiving_owner_id);
CREATE INDEX IF NOT EXISTS cross_returns_res_idx    ON cross_returns(reservation_id);
CREATE INDEX IF NOT EXISTS cross_returns_home_return_status_idx ON cross_returns(home_return_status);
CREATE INDEX IF NOT EXISTS cross_returns_home_return_listing_idx ON cross_returns(home_return_one_way_listing_id);

-- 完了！
