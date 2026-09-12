-- 2026-07-25 メール認証コード & アカウント管理
-- 1) email_otps : Upstash Redis 未設定時の 6桁コード保存先（フォールバック）
-- 2) 予約テーブルへの ON DELETE 連鎖の補助（アカウント削除時のクリーンアップは
--    サーバー側 /api/admin/users DELETE でも明示的に行う）

-- ── メール認証コード（signup / change_email など）──────────────────────────
CREATE TABLE IF NOT EXISTS email_otps (
  purpose     TEXT NOT NULL,                 -- 'signup' | 'change_email' など
  email       TEXT NOT NULL,                 -- 正規化済み（小文字）
  code_hash   TEXT NOT NULL,                 -- SHA-256（生コードは保存しない）
  attempts    INT  NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (purpose, email)
);

CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps (expires_at);

-- サービスロールのみアクセス（RLS 有効・ポリシー無し＝クライアントからは不可視）
ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;

-- 期限切れコードの掃除（任意：pg_cron 等から呼ぶ）
CREATE OR REPLACE FUNCTION purge_expired_email_otps() RETURNS void AS $$
  DELETE FROM email_otps WHERE expires_at < now();
$$ LANGUAGE sql;
