-- vehicles テーブルに保険証書URLカラムを追加
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_cert_url TEXT;

-- ※ Supabase Storage に以下のバケットを手動で作成してください:
--   バケット名: insurance-certs
--   Public: OFF（非公開）
