-- Manual data cleanup for qiaoshanxi stale additional stores.
-- Run the SELECT first. If these are the stores that should disappear from the
-- owner dashboard, run the UPDATE statements below.

select
  id,
  store_name,
  applicant_name,
  email,
  status,
  business_type,
  user_id,
  parent_owner_id
from public.owners
where id in (
  '8957203c-70ca-4218-89cb-625e21a43bd9',
  'd3c38a36-5ed2-4f85-8618-223eb9461e6a',
  '81d140a2-b682-4a48-8a7d-cdb372aadd84',
  'fdd91c00-5705-4f70-b184-10bc1246d6a1',
  '4f8200ad-591a-4023-a3d9-5d213ef7c400',
  '20c5d86d-eb18-4ea7-81b7-40fcdabda12c'
)
order by created_at desc;

begin;

update public.owners
set
  status = 'rejected',
  rejection_reason = 'Deleted by master at 2026-08-23 data cleanup',
  updated_at = now()
where business_type = 'additional_store'
  and id in (
    '8957203c-70ca-4218-89cb-625e21a43bd9',
    'd3c38a36-5ed2-4f85-8618-223eb9461e6a',
    '81d140a2-b682-4a48-8a7d-cdb372aadd84',
    'fdd91c00-5705-4f70-b184-10bc1246d6a1',
    '4f8200ad-591a-4023-a3d9-5d213ef7c400',
    '20c5d86d-eb18-4ea7-81b7-40fcdabda12c'
  )
returning
  id,
  store_name,
  status as updated_status,
  rejection_reason,
  user_id,
  parent_owner_id;

update public.vehicles
set
  status = 'inactive',
  approval_status = 'rejected'
where owner_id in (
  '8957203c-70ca-4218-89cb-625e21a43bd9',
  'd3c38a36-5ed2-4f85-8618-223eb9461e6a',
  '81d140a2-b682-4a48-8a7d-cdb372aadd84',
  'fdd91c00-5705-4f70-b184-10bc1246d6a1',
  '4f8200ad-591a-4023-a3d9-5d213ef7c400',
  '20c5d86d-eb18-4ea7-81b7-40fcdabda12c'
);

commit;

select
  id,
  store_name,
  status,
  rejection_reason,
  user_id,
  parent_owner_id
from public.owners
where id in (
  '8957203c-70ca-4218-89cb-625e21a43bd9',
  'd3c38a36-5ed2-4f85-8618-223eb9461e6a',
  '81d140a2-b682-4a48-8a7d-cdb372aadd84',
  'fdd91c00-5705-4f70-b184-10bc1246d6a1',
  '4f8200ad-591a-4023-a3d9-5d213ef7c400',
  '20c5d86d-eb18-4ea7-81b7-40fcdabda12c'
)
order by store_name;
