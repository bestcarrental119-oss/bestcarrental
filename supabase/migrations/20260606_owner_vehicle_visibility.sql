-- Ensure owner dashboards can find vehicles by both owner row id and auth user id.
-- Run this after 20260606_booking_identity_finance.sql.

alter table public.vehicles
  add column if not exists owner_auth_id uuid;

create index if not exists vehicles_owner_auth_id_idx
  on public.vehicles(owner_auth_id);

comment on column public.vehicles.owner_auth_id is
  'Supabase auth user id of the owner who submitted the vehicle. Used so owner dashboards can show pending and approved submissions reliably.';
