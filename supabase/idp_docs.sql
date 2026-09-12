-- ── IDP / licence / passport images in Storage (not in the DB) ──────────────
-- The renter's identity images are uploaded to a PRIVATE storage bucket when
-- the pickup pass is generated; the database keeps only the storage path.
-- Served to owners via short-lived signed URLs. Files are removed on the
-- retention purge (return date + 30 days), together with the record.

INSERT INTO storage.buckets (id, name, public)
VALUES ('idp-docs', 'idp-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Server code uses the service-role key (supabaseAdmin), which bypasses storage
-- RLS, so no extra storage policies are required.
