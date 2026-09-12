-- Booking identity, luggage, owner finance, and confirmation email support.
-- Run this in Supabase SQL editor before deploying the matching app code.

alter table public.vehicles
  add column if not exists large_suitcases integer not null default 0,
  add column if not exists small_bags integer not null default 0;

alter table public.owners
  add column if not exists owner_code text,
  add column if not exists booking_email_contact text,
  add column if not exists platform_fee_percent numeric(5,2) not null default 15;

alter table public.reservations
  add column if not exists stripe_paid_amount integer,
  add column if not exists confirmation_email_sent_at timestamptz;

update public.owners
set owner_code = concat('OWN-', upper(substr(replace(id::text, '-', ''), 1, 10)))
where owner_code is null;

create unique index if not exists owners_owner_code_key
  on public.owners(owner_code)
  where owner_code is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'owners_platform_fee_percent_range'
  ) then
    alter table public.owners
      add constraint owners_platform_fee_percent_range
      check (platform_fee_percent >= 0 and platform_fee_percent <= 80)
      not valid;
  end if;
end $$;

alter table public.owners validate constraint owners_platform_fee_percent_range;

comment on column public.vehicles.large_suitcases is
  'Large suitcase count with maximum passengers seated. Up to 75 x 50 x 30 cm, approx 70-90L.';

comment on column public.vehicles.small_bags is
  'Small carry-on or soft bag count with maximum passengers seated. Up to 55 x 40 x 20 cm, approx 30-40L.';

comment on column public.owners.owner_code is
  'Human-readable independent owner ID for admin operations.';

comment on column public.owners.booking_email_contact is
  'Owner-provided store contact text included in customer booking confirmation emails.';

comment on column public.owners.platform_fee_percent is
  'Platform fee percentage used to calculate owner payout from Stripe-paid reservation amount.';

comment on column public.reservations.stripe_paid_amount is
  'Exact JPY amount confirmed from Stripe PaymentIntent after payment succeeds.';

comment on column public.reservations.confirmation_email_sent_at is
  'Timestamp when the customer reservation confirmation email was sent or marked sent.';
