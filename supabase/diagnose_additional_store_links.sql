select
  child.id,
  child.store_name,
  child.applicant_name,
  child.email,
  child.status,
  child.user_id,
  child.parent_owner_id,
  parent.store_name as parent_store_name,
  parent.user_id as parent_user_id,
  case
    when child.business_type <> 'additional_store' then 'not_additional_store'
    when child.status <> 'approved' then 'not_approved'
    when child.parent_owner_id is null and child.user_id is null then 'missing_parent_and_user_id'
    when child.parent_owner_id is null then 'missing_parent_owner_id'
    when parent.id is null then 'parent_owner_not_found'
    when parent.user_id is null then 'parent_missing_user_id'
    when child.user_id is distinct from parent.user_id then 'user_id_mismatch'
    else 'ok'
  end as link_status
from public.owners child
left join public.owners parent on parent.id = child.parent_owner_id
where child.business_type = 'additional_store'
order by
  case
    when child.status = 'approved' and (
      child.parent_owner_id is null
      or parent.id is null
      or parent.user_id is null
      or child.user_id is distinct from parent.user_id
    ) then 0
    else 1
  end,
  child.created_at desc;
