-- ── Digital IDP pickup pass (QR) ─────────────────────────────────────────────
-- Replaces printing the International Driving Permit at pickup.
--
-- Flow:
--   1. After payment, the renter generates a "pickup pass" for the reservation.
--      A random pickup_token is stored on the reservation together with a
--      snapshot of their IDP / licence / passport info (idp_snapshot JSONB).
--   2. A QR encoding ONLY the opaque token is shown to the renter. No personal
--      data lives in the QR itself, so a screenshot leaks nothing.
--   3. At pickup the owner scans the QR in-app. The server resolves the token,
--      verifies the reservation belongs to that owner, and copies the snapshot
--      into owner_pickup_records (the owner's saved copy for print / export).
--   4. Records auto-purge 30 days after the return date (privacy).

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS pickup_token          TEXT,
  ADD COLUMN IF NOT EXISTS pickup_pass_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idp_snapshot          JSONB,
  ADD COLUMN IF NOT EXISTS pickup_verified_at    TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_pickup_token
  ON reservations (pickup_token) WHERE pickup_token IS NOT NULL;

-- Owner's saved copy of scanned pickup documents.
CREATE TABLE IF NOT EXISTS owner_pickup_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         TEXT NOT NULL,
  reservation_id   TEXT NOT NULL,
  token            TEXT,
  renter_name      TEXT,
  nat              TEXT,
  reservation_info JSONB,   -- vehicle, pickup/return, totals, etc.
  documents        JSONB,   -- IDP / licence / passport snapshot (incl. photos)
  scanned_at       TIMESTAMPTZ DEFAULT now(),
  purge_after      TIMESTAMPTZ,        -- return date + 30 days
  UNIQUE (owner_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_pickup_records_owner
  ON owner_pickup_records (owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_pickup_records_purge
  ON owner_pickup_records (purge_after);
