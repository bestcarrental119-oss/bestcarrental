-- ================================================================
--  Best Car Rental — Supabase PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  phone       TEXT,
  nationality TEXT,
  license     TEXT,
  spent       INT  DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vehicles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maker               TEXT NOT NULL,
  model               TEXT NOT NULL,
  year                INT,
  grade               TEXT,
  cls                 TEXT,          -- 'kei' | 'compact' | 'standard' | 'suv' | 'minivan' | 'luxury_minivan' | 'other'
  type                TEXT,          -- 'corporate' | 'p2p'
  pax                 INT,
  fuel                TEXT,
  trans               TEXT,
  price_day           INT  DEFAULT 0,
  price_hour          INT  DEFAULT 0,
  deposit             INT  DEFAULT 0,
  insurance           INT  DEFAULT 1100,
  insurance_plans     TEXT[] DEFAULT ARRAY['waiver','waiverPlus','perfect']::TEXT[],  -- paid tiers offered to renters
  rating              NUMERIC(3,2) DEFAULT 5.0,
  reviews             INT  DEFAULT 0,
  loc                 TEXT,          -- display name
  lat                 NUMERIC(10,6),
  lng                 NUMERIC(10,6),
  img_url             TEXT,          -- Supabase Storage URL
  inspection_cert_url TEXT,          -- Supabase Storage URL
  inspection_expiry   DATE,
  badge               TEXT,
  badge_bg            TEXT,
  tags                TEXT[]  DEFAULT '{}',
  status              TEXT    DEFAULT 'active',
  one_way_enabled     BOOLEAN DEFAULT false,
  airports            TEXT[]  DEFAULT '{}',  -- e.g. ['NRT','HND']
  airport_fees        JSONB   DEFAULT '{}',  -- e.g. {"NRT":5000,"HND":3300}
  holder              JSONB,                 -- P2P owner info
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Reservations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY,          -- BCR-YYYY-XXXX
  vehicle_id  UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id)   ON DELETE SET NULL,
  pickup_at   TIMESTAMPTZ,
  return_at   TIMESTAMPTZ,
  days        INT,
  total       INT,
  status      TEXT DEFAULT 'pending',    -- pending|confirmed|in_progress|completed|cancelled
  type        TEXT,                      -- 'corporate' | 'p2p'
  opts        JSONB DEFAULT '{}',        -- {insurance,etc,seat,oneway}
  pickup_loc  TEXT,
  return_loc  TEXT,                      -- airport code for one-way
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security (RLS) ─────────────────────────────────────
-- Enable RLS (anon key can only read active vehicles)
ALTER TABLE vehicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Public can read active vehicles
CREATE POLICY "Public read active vehicles"
  ON vehicles FOR SELECT
  USING (status = 'active');

-- Authenticated users can read their own data
CREATE POLICY "Users read own profile"
  ON users FOR SELECT
  USING (auth.uid()::text = id::text);

-- Service role bypasses all RLS (used by admin APIs)
-- (No policy needed — service role always bypasses)

-- ── Storage Buckets (run separately or via dashboard) ────────────
-- Bucket: vehicle-photos   (public read)
-- Bucket: inspection-certs (private — admin only)
-- Create via: Supabase Dashboard → Storage → New Bucket
