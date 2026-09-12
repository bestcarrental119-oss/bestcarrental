-- ── Export reminder before auto-deletion ────────────────────────────────────
-- Owners get an email ~7 days before a pickup record (IDP + handover photos)
-- is auto-deleted, so they can export/download anything they need to keep.
-- reminder_sent_at marks that the reminder was already sent (send once).

ALTER TABLE owner_pickup_records
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_owner_pickup_records_reminder
  ON owner_pickup_records (purge_after, reminder_sent_at);
