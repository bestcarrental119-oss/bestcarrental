-- Fix reservation user foreign key for Supabase Auth users.
-- Run this in Supabase SQL Editor if booking fails with:
-- insert or update on table "reservations" violates foreign key constraint "reservations_user_id_fkey"

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_user_id_fkey;

UPDATE reservations
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE auth.users.id = reservations.user_id
  );

ALTER TABLE reservations
  ADD CONSTRAINT reservations_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
