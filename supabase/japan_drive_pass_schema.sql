-- Japan Drive Pass / Guest Checkout / One-way return extension
-- Run in Supabase SQL Editor after the base schema.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  preferred_language TEXT DEFAULT 'en',
  nationality TEXT,
  phone TEXT,
  loyalty_tier TEXT NOT NULL DEFAULT 'bronze' CHECK (loyalty_tier IN ('bronze','silver','gold')),
  total_bookings INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  fast_pickup_eligible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS japan_drive_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name TEXT,
  face_photo_url TEXT,
  passport_url TEXT,
  driver_license_url TEXT,
  idp_url TEXT,
  idp_expires_on DATE,
  preferred_language TEXT DEFAULT 'en',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  insurance_preference TEXT,
  etc_preference BOOLEAN DEFAULT false,
  driving_experience TEXT,
  screening_status TEXT NOT NULL DEFAULT 'draft' CHECK (screening_status IN ('draft','pending','approved','rejected')),
  screening_note TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS guest_booking_token TEXT,
  ADD COLUMN IF NOT EXISTS contact_handles JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS idp_document_url TEXT,
  ADD COLUMN IF NOT EXISTS idp_file_name TEXT,
  ADD COLUMN IF NOT EXISTS idp_expires_on DATE,
  ADD COLUMN IF NOT EXISTS drive_pass_id UUID REFERENCES japan_drive_passes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS one_way_location_id UUID,
  ADD COLUMN IF NOT EXISTS one_way_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itinerary_title TEXT;

CREATE INDEX IF NOT EXISTS idx_reservations_guest_email ON reservations(guest_email);
CREATE INDEX IF NOT EXISTS idx_reservations_guest_booking_token ON reservations(guest_booking_token);
CREATE INDEX IF NOT EXISTS idx_reservations_owner_id ON reservations(owner_id);
CREATE INDEX IF NOT EXISTS idx_japan_drive_passes_user_id ON japan_drive_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_japan_drive_passes_screening_status ON japan_drive_passes(screening_status);

CREATE TABLE IF NOT EXISTS reservation_contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id TEXT REFERENCES reservations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','line','wechat','messenger','email','phone')),
  handle TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS one_way_return_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES owners(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_way_locations_owner_id ON one_way_return_locations(owner_id);
CREATE INDEX IF NOT EXISTS idx_one_way_locations_vehicle_id ON one_way_return_locations(vehicle_id);

CREATE TABLE IF NOT EXISTS itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  reservation_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE japan_drive_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_contact_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_way_return_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles own read" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles own update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "drive pass own read" ON japan_drive_passes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "drive pass own write" ON japan_drive_passes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "itineraries own access" ON itineraries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "one way locations public read" ON one_way_return_locations FOR SELECT USING (active = true);

UPDATE reservations
SET owner_id = vehicles.owner_id
FROM vehicles
WHERE reservations.vehicle_id = vehicles.id
  AND reservations.owner_id IS NULL;

NOTIFY pgrst, 'reload schema';
