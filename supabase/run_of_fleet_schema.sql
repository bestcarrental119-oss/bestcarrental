-- Run-of-fleet / class-based booking extension.
-- Run this after schema.sql, owners_schema.sql, and japan_drive_pass_schema.sql.

ALTER TABLE reservations
  ALTER COLUMN vehicle_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'specific'
    CHECK (booking_type IN ('specific', 'class_based')),
  ADD COLUMN IF NOT EXISTS target_class TEXT,
  ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (assignment_status IN ('assigned', 'pending_assignment')),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID;

UPDATE reservations
SET
  booking_type = 'specific',
  assignment_status = CASE WHEN vehicle_id IS NULL THEN 'pending_assignment' ELSE 'assigned' END,
  target_class = COALESCE(target_class, vehicles.cls)
FROM vehicles
WHERE reservations.vehicle_id = vehicles.id;

UPDATE reservations
SET
  booking_type = CASE WHEN vehicle_id IS NULL THEN 'class_based' ELSE 'specific' END,
  assignment_status = CASE WHEN vehicle_id IS NULL THEN 'pending_assignment' ELSE 'assigned' END,
  target_class = COALESCE(target_class, 'standard')
WHERE target_class IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_class_inventory
  ON reservations(owner_id, target_class, pickup_at, return_at)
  WHERE booking_type = 'class_based';

CREATE INDEX IF NOT EXISTS idx_reservations_assignment_status
  ON reservations(owner_id, assignment_status);

CREATE OR REPLACE FUNCTION normalize_vehicle_class(p_class TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(replace(COALESCE(NULLIF(trim(p_class), ''), 'standard'), '-', '_'))
    WHEN 'k' THEN 'kei'
    WHEN 'kei_car' THEN 'kei'
    WHEN 'light' THEN 'kei'
    WHEN 'light_car' THEN 'kei'
    WHEN 's' THEN 'compact'
    WHEN 'compact_car' THEN 'compact'
    WHEN 'g' THEN 'standard'
    WHEN 'standard_car' THEN 'standard'
    WHEN 'ordinary_car' THEN 'standard'
    WHEN 'normal_car' THEN 'standard'
    WHEN 'f1' THEN 'minivan'
    WHEN 'mpv' THEN 'minivan'
    WHEN 'f2' THEN 'luxury_minivan'
    WHEN 'luxury_mpv' THEN 'luxury_minivan'
    WHEN 'v' THEN 'other'
    WHEN 'other_vehicle' THEN 'other'
    WHEN 'other_vehicles' THEN 'other'
    WHEN 'special_vehicle' THEN 'other'
    WHEN 'special_vehicles' THEN 'other'
    WHEN 'van' THEN 'other'
    WHEN 'large_van' THEN 'other'
    WHEN 'convertible' THEN 'other'
    ELSE lower(replace(COALESCE(NULLIF(trim(p_class), ''), 'standard'), '-', '_'))
  END
$$;

UPDATE reservations
SET target_class = normalize_vehicle_class(target_class)
WHERE target_class IS NOT NULL;

CREATE OR REPLACE FUNCTION create_class_based_reservation(p_reservation JSONB)
RETURNS reservations
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id UUID := NULLIF(p_reservation->>'owner_id', '')::UUID;
  v_target_class TEXT := normalize_vehicle_class(p_reservation->>'target_class');
  v_pickup_at TIMESTAMPTZ := NULLIF(p_reservation->>'pickup_at', '')::TIMESTAMPTZ;
  v_return_at TIMESTAMPTZ := NULLIF(p_reservation->>'return_at', '')::TIMESTAMPTZ;
  v_total INT;
  v_specific_count INT;
  v_class_count INT;
  v_available INT;
  v_saved reservations;
BEGIN
  IF v_owner_id IS NULL OR v_pickup_at IS NULL OR v_return_at IS NULL THEN
    RAISE EXCEPTION 'owner_id, pickup_at and return_at are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_id::TEXT || ':' || v_target_class, 0));

  SELECT COUNT(*)
  INTO v_total
  FROM vehicles
  WHERE owner_id = v_owner_id
    AND normalize_vehicle_class(cls) = v_target_class
    AND COALESCE(status, 'active') <> 'maintenance'
    AND COALESCE(approval_status, 'approved') = 'approved';

  SELECT COUNT(DISTINCT r.vehicle_id)
  INTO v_specific_count
  FROM reservations r
  JOIN vehicles v ON v.id = r.vehicle_id
  WHERE v.owner_id = v_owner_id
    AND normalize_vehicle_class(v.cls) = v_target_class
    AND r.status NOT IN ('cancelled', 'canceled', 'rejected')
    AND r.pickup_at < v_return_at
    AND r.return_at > v_pickup_at;

  SELECT COUNT(*)
  INTO v_class_count
  FROM reservations
  WHERE owner_id = v_owner_id
    AND booking_type = 'class_based'
    AND normalize_vehicle_class(target_class) = v_target_class
    AND status NOT IN ('cancelled', 'canceled', 'rejected')
    AND pickup_at < v_return_at
    AND return_at > v_pickup_at;

  v_available := v_total - v_specific_count - v_class_count;
  IF v_available <= 0 THEN
    RAISE EXCEPTION 'No run-of-fleet inventory remains for %', v_target_class;
  END IF;

  INSERT INTO reservations (
    id, vehicle_id, owner_id, user_id, pickup_at, return_at, days, total, status, type,
    opts, pickup_loc, return_loc, review_deadline, payout_enabled, stripe_payment_intent_id,
    guest_name, guest_email, guest_phone, guest_booking_token, contact_handles,
    idp_file_name, idp_expires_on, drive_pass_id, one_way_location_id, one_way_fee,
    booking_type, target_class, assignment_status
  )
  VALUES (
    p_reservation->>'id',
    NULL,
    v_owner_id,
    NULLIF(p_reservation->>'user_id', '')::UUID,
    v_pickup_at,
    v_return_at,
    COALESCE((p_reservation->>'days')::INT, 1),
    COALESCE((p_reservation->>'total')::INT, 0),
    'pending_assignment',
    COALESCE(p_reservation->>'type', 'corporate'),
    COALESCE(p_reservation->'opts', '{}'::JSONB),
    p_reservation->>'pickup_loc',
    p_reservation->>'return_loc',
    NULLIF(p_reservation->>'review_deadline', '')::TIMESTAMPTZ,
    COALESCE((p_reservation->>'payout_enabled')::BOOLEAN, false),
    p_reservation->>'stripe_payment_intent_id',
    p_reservation->>'guest_name',
    p_reservation->>'guest_email',
    p_reservation->>'guest_phone',
    p_reservation->>'guest_booking_token',
    COALESCE(p_reservation->'contact_handles', '{}'::JSONB),
    p_reservation->>'idp_file_name',
    NULLIF(p_reservation->>'idp_expires_on', '')::DATE,
    NULLIF(p_reservation->>'drive_pass_id', '')::UUID,
    NULLIF(p_reservation->>'one_way_location_id', '')::UUID,
    COALESCE((p_reservation->>'one_way_fee')::NUMERIC, 0),
    'class_based',
    v_target_class,
    'pending_assignment'
  )
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION assign_run_of_fleet_vehicle(
  p_reservation_id TEXT,
  p_vehicle_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS reservations
LANGUAGE plpgsql
AS $$
DECLARE
  v_res reservations;
  v_vehicle vehicles;
  v_conflicts INT;
  v_saved reservations;
BEGIN
  SELECT * INTO v_res
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  SELECT * INTO v_vehicle
  FROM vehicles
  WHERE id = p_vehicle_id
  FOR UPDATE;

  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF v_vehicle.owner_id IS DISTINCT FROM v_res.owner_id THEN
    RAISE EXCEPTION 'Vehicle does not belong to reservation owner';
  END IF;

  IF normalize_vehicle_class(v_vehicle.cls) NOT IN (
    SELECT unnest(CASE normalize_vehicle_class(v_res.target_class)
      WHEN 'kei' THEN ARRAY['kei','compact','standard','suv','minivan','luxury_minivan','other']
      WHEN 'compact' THEN ARRAY['compact','standard','suv','minivan','luxury_minivan','other']
      WHEN 'standard' THEN ARRAY['standard','suv','minivan','luxury_minivan','other']
      WHEN 'suv' THEN ARRAY['suv','minivan','luxury_minivan','other']
      WHEN 'minivan' THEN ARRAY['minivan','luxury_minivan','other']
      WHEN 'luxury_minivan' THEN ARRAY['luxury_minivan','other']
      ELSE ARRAY['other']
    END)
  ) THEN
    RAISE EXCEPTION 'Vehicle class is not eligible';
  END IF;

  SELECT COUNT(*)
  INTO v_conflicts
  FROM reservations
  WHERE id <> p_reservation_id
    AND vehicle_id = p_vehicle_id
    AND status NOT IN ('cancelled', 'canceled', 'rejected')
    AND pickup_at < v_res.return_at
    AND return_at > v_res.pickup_at;

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'Vehicle is already booked for this period';
  END IF;

  UPDATE reservations
  SET
    vehicle_id = p_vehicle_id,
    assignment_status = 'assigned',
    status = CASE WHEN status = 'pending_assignment' THEN 'confirmed' ELSE status END,
    assigned_at = NOW(),
    assigned_by = p_assigned_by
  WHERE id = p_reservation_id
  RETURNING * INTO v_saved;

  RETURN v_saved;
END;
$$;

NOTIFY pgrst, 'reload schema';
