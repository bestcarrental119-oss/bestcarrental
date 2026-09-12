-- ── チャット機能スキーマ ──────────────────────────────────────────

-- 会話（借りる側 ↔ オーナー × 車両）
CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id       UUID,        -- 借りる側の Supabase auth user id
  owner_user_id UUID,        -- オーナーの Supabase auth user id
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- メッセージ
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL,               -- 送信者の Supabase auth user id
  sender_role     TEXT CHECK (sender_role IN ('user','owner')),
  content         TEXT NOT NULL,               -- 原文（送信者の言語）
  detected_lang   TEXT DEFAULT 'ja',           -- 原文の言語コード
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_conversations_user_id       ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner_user_id ON conversations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_vehicle_id    ON conversations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id    ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at         ON messages(created_at);

-- Supabase Realtime 有効化
ALTER TABLE messages      REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

-- RLS（認証ユーザーのみアクセス）
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;

-- conversations: 自分が関係している会話のみ見える
CREATE POLICY "users see own conversations" ON conversations
  FOR ALL USING (
    auth.uid() = user_id OR auth.uid() = owner_user_id
  );

-- messages: 自分が参加している会話のメッセージのみ
CREATE POLICY "users see conversation messages" ON messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE user_id = auth.uid() OR owner_user_id = auth.uid()
    )
  );

-- 既読管理（後から追加）
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);
