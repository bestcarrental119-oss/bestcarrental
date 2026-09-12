create or replace function public.link_additional_store_owner_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_owner_id_value uuid;
  parent_user_id uuid;
begin
  if new.business_type = 'additional_store' then
    if new.parent_owner_id is null and new.user_id is not null then
      select id, user_id
        into parent_owner_id_value, parent_user_id
        from public.owners
        where user_id = new.user_id
          and business_type <> 'additional_store'
          and status = 'approved'
        order by created_at asc
        limit 1;

      if parent_owner_id_value is not null then
        new.parent_owner_id := parent_owner_id_value;
      end if;
    end if;

    if new.parent_owner_id is not null then
      select id, user_id
        into parent_owner_id_value, parent_user_id
        from public.owners
        where id = new.parent_owner_id;

      if parent_user_id is not null then
        new.user_id := parent_user_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists owners_link_additional_store_owner_user on public.owners;

create trigger owners_link_additional_store_owner_user
before insert or update of status, business_type, parent_owner_id, user_id
on public.owners
for each row
when (new.business_type = 'additional_store')
execute function public.link_additional_store_owner_user();

update public.owners child
set user_id = parent.user_id
from public.owners parent
where child.business_type = 'additional_store'
  and child.parent_owner_id = parent.id
  and parent.user_id is not null
  and child.user_id is distinct from parent.user_id;

with linked as (
  select
    child.id as child_id,
    parent.id as parent_id,
    parent.user_id as parent_user_id
  from public.owners child
  join lateral (
    select id, user_id
    from public.owners parent
    where parent.user_id = child.user_id
      and parent.business_type <> 'additional_store'
      and parent.status = 'approved'
    order by parent.created_at asc
    limit 1
  ) parent on true
  where child.business_type = 'additional_store'
    and child.parent_owner_id is null
    and child.user_id is not null
)
update public.owners child
set
  parent_owner_id = linked.parent_id,
  user_id = linked.parent_user_id
from linked
where child.id = linked.child_id;
