-- ── Policy-based automatic cancellation settlement ──────────────────────────
-- Used by POST /api/cancel. When a customer cancels, the server computes the
-- cancellation fee from the platform policy. If the reservation is only
-- authorized, Stripe captures just the fee and releases the rest. If a legacy
-- reservation was already paid, Stripe refunds paid minus fee. These columns
-- record the outcome for the receipt / audit.
--
--   cancel_fee       : amount kept per the cancellation policy (minor units)
--   refund_amount    : amount refunded to the customer's card (minor units)
--   stripe_refund_id : Stripe refund object id (re.xxx)
--
-- payment_status gains these values in addition to the existing ones:
-- 'authorized', 'cancel_fee_captured', 'released', 'refunded'.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancel_fee        INTEGER,
  ADD COLUMN IF NOT EXISTS refund_amount     INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_refund_id  TEXT;
