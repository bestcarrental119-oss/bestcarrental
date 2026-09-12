-- Read-only diagnosis. This does not update or delete anything.
-- Run this first in Supabase SQL Editor before any restore/delete SQL.

-- 1) Are vehicle rows still present?
select
  count(*) as total_vehicle_rows,
  count(*) filter (where coalesce(status, 'active') = 'active') as active_rows,
  count(*) filter (where coalesce(approval_status, 'approved') = 'approved') as approved_rows,
  count(*) filter (
    where coalesce(status, 'active') = 'active'
      and coalesce(approval_status, 'approved') = 'approved'
  ) as public_visible_rows,
  count(*) filter (where lower(coalesce(status, '')) = 'deleted') as status_deleted_rows,
  count(*) filter (where lower(coalesce(status, '')) in ('inactive', 'maintenance')) as intentionally_hidden_rows,
  count(*) filter (where lower(coalesce(approval_status, '')) = 'rejected') as rejected_rows,
  count(*) filter (where lower(coalesce(status, '')) = 'deleted' or lower(coalesce(approval_status, '')) = 'rejected') as suspicious_hidden_rows
from public.vehicles;

-- 2) Breakdown by status and approval status.
select
  coalesce(status, '(null)') as status,
  coalesce(approval_status, '(null)') as approval_status,
  count(*) as rows
from public.vehicles
group by coalesce(status, '(null)'), coalesce(approval_status, '(null)')
order by rows desc, status, approval_status;

-- 3) Recent vehicle rows, including hidden ones.
select
  id,
  maker,
  model,
  year,
  cls,
  loc,
  owner_id,
  owner_auth_id,
  status,
  approval_status,
  created_at,
  updated_at
from public.vehicles
order by coalesce(updated_at, created_at) desc nulls last
limit 50;

-- 4) Rows most likely hidden by the previous emergency fallback.
select
  id,
  maker,
  model,
  year,
  cls,
  loc,
  owner_id,
  owner_auth_id,
  status,
  approval_status,
  one_way_enabled,
  created_at,
  updated_at
from public.vehicles
where lower(coalesce(status, '')) = 'deleted'
   or lower(coalesce(approval_status, '')) = 'rejected'
order by coalesce(updated_at, created_at) desc nulls last;

-- 5) Do owner/store rows still exist?
select
  count(*) as total_owner_rows,
  count(*) filter (where status = 'approved') as approved_owner_rows,
  count(*) filter (where status = 'rejected') as rejected_owner_rows,
  count(*) filter (where business_type = 'additional_store') as additional_store_rows
from public.owners;

-- 6) Owner/store rows with vehicle counts.
select
  o.id,
  o.user_id,
  o.store_name,
  o.applicant_name,
  o.business_type,
  o.status,
  count(v.id) as vehicle_rows
from public.owners o
left join public.vehicles v
  on v.owner_id = o.id
  or v.owner_auth_id = o.user_id
group by o.id, o.user_id, o.store_name, o.applicant_name, o.business_type, o.status
order by vehicle_rows desc, o.store_name nulls last
limit 100;

-- 7) Does the master auth account still exist?
select
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  last_sign_in_at,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
from auth.users
where lower(email) = 'agentkaku0221@gmail.com';

-- 8) Is the force-delete RPC installed?
select
  routine_schema,
  routine_name,
  routine_type,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'master_force_delete_vehicle';
