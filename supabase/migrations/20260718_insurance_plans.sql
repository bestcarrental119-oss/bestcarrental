-- Renter-selectable insurance / collision damage waiver tiers.
-- Owners pick WHICH of the three paid tiers (waiver / waiverPlus / perfect)
-- they offer per vehicle. The base tier is always available and is not stored.
-- NULL = legacy vehicle → all three paid tiers are offered by default.

alter table public.vehicles
  add column if not exists insurance_plans text[] default array['waiver','waiverPlus','perfect']::text[];

comment on column public.vehicles.insurance_plans is
  'Paid insurance tiers this vehicle offers to renters. Subset of {waiver, waiverPlus, perfect}. The free "basic" tier is always available. NULL means all three are offered.';
