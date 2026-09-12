-- ================================================================
--  Reviews Schema — Airbnb-style Double-Blind Review System
--  Run in: Supabase Dashboard → SQL Editor
-- ================================================================

-- ── Reviews table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  reviewer_id     UUID,                      -- who wrote the review
  reviewee_id     UUID,                      -- who is being reviewed
  reviewer_role   TEXT NOT NULL,             -- 'customer' | 'host'
  rating          INT  NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         TEXT,
  is_auto         BOOLEAN DEFAULT false,     -- true = system auto-generated (star 5)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Add columns to reservations ───────────────────────────────────
-- Status flow: pending → confirmed → in_progress → waiting_review → completed | cancelled
-- payout_enabled: true when both reviews done (or 14 days passed)

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_enabled            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_deadline           TIMESTAMPTZ;  -- return_at + 14 days

-- ── Index for fast lookups ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_reservation ON reviews(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee    ON reviews(reviewee_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Visible reviews: either both sides reviewed, or deadline passed
-- (enforced in API layer for flexibility)
CREATE POLICY "Service role full access reviews"
  ON reviews FOR ALL
  USING (true);
