-- ── Pickup / return handover photos (GPS + timestamp) ───────────────────────
-- Owners photograph the vehicle at pickup and at return. Each photo is stored
-- in Supabase STORAGE (object storage) — NOT in the database — and the DB only
-- keeps a tiny reference: { phase, path, lat, lng, at }. This keeps the
-- database small no matter how many photos are taken. The bucket is PRIVATE;
-- the app serves images through short-lived signed URLs.

-- 1) Column that holds the lightweight photo references (paths, not images).
ALTER TABLE owner_pickup_records
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- 2) Private storage bucket for the handover photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('handover-photos', 'handover-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Server code uses the service-role key (supabaseAdmin), which bypasses storage
-- RLS, so no extra storage policies are required for upload / signed URLs.
