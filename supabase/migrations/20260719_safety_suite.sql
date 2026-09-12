-- ¥0事前オーソリ／電子契約書／AI損傷チェック 用のスキーマ

-- 事前オーソリの記録（reservations）。損害同意は opts(jsonb) に保存。
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS preauth_mode TEXT,
  ADD COLUMN IF NOT EXISTS preauth_at   TIMESTAMPTZ;

-- 車両状態チェック（貸出前/返却後の写真と AI/手動の損傷解析）
CREATE TABLE IF NOT EXISTS damage_inspections (
  reservation_id TEXT PRIMARY KEY,
  photos     JSONB DEFAULT '{}'::jsonb,   -- { angleId: { before: dataUrl, after: dataUrl } }
  analysis   JSONB,                        -- AI/手動の解析結果
  est_cost   INT DEFAULT 0,               -- 推定修理費合計（¥）
  mode       TEXT,                         -- 'ai' | 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE damage_inspections ENABLE ROW LEVEL SECURITY;

-- オーナー既定の事前オーソリ方式
ALTER TABLE owners ADD COLUMN IF NOT EXISTS preauth_mode TEXT DEFAULT 'zero';
