-- Add Stripe payment intent ID column to reservations
-- Run in: Supabase Dashboard → SQL Editor

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
