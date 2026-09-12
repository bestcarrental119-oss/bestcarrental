-- ══════════════════════════════════════════════════════════════════════════
-- 異地还车：地図対応（受け入れ拠点の座標＋車ごとの返却先指定）
--   ・cross_return_settings に受け入れ拠点の緯度経度を追加（地図表示用）
--   ・cross_return_dests：車両ごとに「返却を許可する受け入れオーナー」を登録
-- ※ 先に CROSS_RETURN_異地还车.sql を実行済みであること。冪等（何度でもOK）
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_return_settings
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6);

-- 車両ごとの返却先（許可した受け入れオーナー）
CREATE TABLE IF NOT EXISTS cross_return_dests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id         UUID NOT NULL,
  origin_owner_id    UUID,
  receiving_owner_id UUID NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
-- 元オーナーが設定する「想定保管日数」（保管料モードの顧客請求に使用）
ALTER TABLE cross_return_dests ADD COLUMN IF NOT EXISTS expected_days INT DEFAULT 1;
-- 車両ごとに元オーナーが設定する「Best Go基本費用」（顧客請求に加算）
ALTER TABLE cross_return_dests ADD COLUMN IF NOT EXISTS base_fee INT DEFAULT 0;
ALTER TABLE cross_returns ADD COLUMN IF NOT EXISTS base_fee INT DEFAULT 0;
ALTER TABLE cross_return_dests ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS cross_return_dests_uni ON cross_return_dests(vehicle_id, receiving_owner_id);
CREATE INDEX IF NOT EXISTS cross_return_dests_veh_idx ON cross_return_dests(vehicle_id);
CREATE INDEX IF NOT EXISTS cross_return_dests_recv_idx ON cross_return_dests(receiving_owner_id);

-- 完了！
