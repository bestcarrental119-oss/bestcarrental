-- Allow one login account to manage multiple stores and separate the
-- administrator-facing applicant name from the customer-facing store name.

alter table public.owners
  add column if not exists applicant_name text;

alter table public.owners
  add column if not exists parent_owner_id uuid references public.owners(id) on delete set null;

alter table public.owners
  drop constraint if exists owners_business_type_check;

alter table public.owners
  add constraint owners_business_type_check
  check (business_type in ('individual', 'corporation', 'additional_store'));

update public.owners
set applicant_name = store_name
where applicant_name is null;

update public.owners
set store_name = concat('Best Car Rental ', coalesce(nullif(store_location, ''), '未設定'), '店')
where store_name is null
   or btrim(store_name) = '';

comment on column public.owners.applicant_name is
  'Name submitted by the owner applicant for admin identification. Public customers see store_name instead.';

comment on column public.owners.store_name is
  'Customer-facing store display name set by administrators, e.g. Best Car Rental XX店.';

comment on column public.owners.parent_owner_id is
  'For additional store applications, the existing owner/store record from which the store was added.';

notify pgrst, 'reload schema';
