-- Fix owner dashboard reservation delivery.
-- Adds reservations.owner_id and backfills existing reservations from vehicles.owner_id.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_owner_id ON reservations(owner_id);

UPDATE reservations
SET owner_id = vehicles.owner_id
FROM vehicles
WHERE reservations.vehicle_id = vehicles.id
  AND reservations.owner_id IS NULL;

NOTIFY pgrst, 'reload schema';
