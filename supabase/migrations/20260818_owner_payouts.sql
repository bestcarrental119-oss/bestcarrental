-- Owner payout (振込申請) requests.
-- Owners request a payout of their available earnings; admins review the amount
-- and mark it approved / paid / rejected. Bank details are snapshotted onto the
-- request row so a later edit of the owner profile never rewrites history.
-- Run this in the Supabase SQL editor (or via the CLI) before deploying the
-- matching app code.

create table if not exists public.payout_requests (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.owners(id) on delete cascade,
  amount              numeric(12,2) not null check (amount > 0),
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'paid', 'rejected')),
  note                text,          -- optional message from the owner
  admin_note          text,          -- optional message from the admin (e.g. reject reason)

  -- Snapshot of the payout bank account at request time.
  bank_name           text,
  bank_branch         text,
  bank_account_type   text,
  bank_account_number text,
  bank_account_holder text,

  requested_by        uuid,          -- auth user id that submitted the request
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  processed_at        timestamptz    -- set when moved out of 'pending'
);

create index if not exists payout_requests_owner_idx  on public.payout_requests(owner_id);
create index if not exists payout_requests_status_idx on public.payout_requests(status);
create index if not exists payout_requests_created_idx on public.payout_requests(created_at desc);

-- Keep updated_at fresh on every change.
create or replace function public.set_payout_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_payout_requests_updated_at on public.payout_requests;
create trigger trg_payout_requests_updated_at
  before update on public.payout_requests
  for each row execute function public.set_payout_requests_updated_at();

-- Bank details hold sensitive info; lock the table down to the service role.
-- All app access goes through the server API using the Supabase service key,
-- which bypasses RLS, so no anon/authenticated policies are required.
alter table public.payout_requests enable row level security;

comment on table public.payout_requests is
  'Owner-initiated payout requests. Bank fields are a snapshot taken at request time.';
comment on column public.payout_requests.amount is
  'Requested payout amount in JPY. Validated server-side against the owner''s available balance.';
comment on column public.payout_requests.status is
  'pending → approved / paid / rejected. Only admins change this.';
