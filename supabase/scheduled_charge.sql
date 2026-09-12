-- ── Deferred authorization (card-on-file, authorize later) ───────────────────
-- Strategy: at booking we only SAVE the card (Stripe SetupIntent, no fee).
-- The card is authorized automatically at (pickup - 7 days) = the moment the
-- free-cancellation window closes. Capture happens at pickup or, if cancelled,
-- only for the policy cancellation fee.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS stripe_customer_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id  TEXT,
  ADD COLUMN IF NOT EXISTS charge_at                 TIMESTAMPTZ,
  -- payment_status: 'scheduled'             (card saved, not authorized yet)
  --                 'authorized'            (manual-capture hold exists)
  --                 'paid'                  (captured)
  --                 'cancel_fee_captured'   (only cancellation fee captured)
  --                 'released'              (hold released without capture)
  --                 'failed'                (auto-authorization failed)
  --                 'none'                  (demo / no online payment)
  ADD COLUMN IF NOT EXISTS payment_status            TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS charge_attempts           INT  DEFAULT 0;

-- Fast lookup for the cron that charges due reservations
CREATE INDEX IF NOT EXISTS idx_reservations_charge_due
  ON reservations (payment_status, charge_at);
