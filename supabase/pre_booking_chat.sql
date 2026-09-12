-- Reservation-free owner chat opt-in.
-- Run in Supabase SQL Editor.

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS pre_booking_chat_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_owners_pre_booking_chat_enabled
  ON owners(pre_booking_chat_enabled);

NOTIFY pgrst, 'reload schema';
