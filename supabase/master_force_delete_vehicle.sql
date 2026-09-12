-- Run once in Supabase SQL Editor.
-- 1) Restore vehicles hidden by the previous emergency fallback.
-- 2) Install a service-role-only RPC that force-deletes exactly one requested vehicle id.

update public.vehicles
set
  status = 'active',
  approval_status = 'approved',
  updated_at = now()
where status = 'deleted'
returning id, maker, model, year, status, approval_status;

create or replace function public._bcr_column_exists(target_table text, target_column text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table
      and column_name = target_column
  );
$$;

create or replace function public.master_force_delete_vehicle(target_vehicle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref record;
  affected integer := 0;
  set_parts text[] := array[]::text[];
  target_class text := 'standard';
  log jsonb := '[]'::jsonb;
begin
  if target_vehicle_id is null then
    raise exception 'target_vehicle_id required';
  end if;

  select coalesce(cls, 'standard')
    into target_class
    from public.vehicles
   where id = target_vehicle_id;

  if not found then
    return jsonb_build_object('success', true, 'mode', 'not_found', 'log', log);
  end if;

  if to_regclass('public.reservations') is not null
     and public._bcr_column_exists('reservations', 'vehicle_id') then
    set_parts := array['vehicle_id = null'];
    if public._bcr_column_exists('reservations', 'booking_type') then
      set_parts := array_append(set_parts, 'booking_type = ''class_based''');
    end if;
    if public._bcr_column_exists('reservations', 'assignment_status') then
      set_parts := array_append(set_parts, 'assignment_status = ''pending_assignment''');
    end if;
    if public._bcr_column_exists('reservations', 'target_class') then
      set_parts := array_append(set_parts, 'target_class = $2');
    end if;
    if public._bcr_column_exists('reservations', 'assigned_at') then
      set_parts := array_append(set_parts, 'assigned_at = null');
    end if;
    if public._bcr_column_exists('reservations', 'assigned_by') then
      set_parts := array_append(set_parts, 'assigned_by = null');
    end if;

    execute 'update public.reservations set ' || array_to_string(set_parts, ', ') || ' where vehicle_id = $1'
      using target_vehicle_id, target_class;
    get diagnostics affected = row_count;
    log := log || jsonb_build_array(jsonb_build_object('table', 'public.reservations', 'action', 'update_null', 'rows', affected));
  end if;

  for ref in
    select
      kcu.table_schema,
      kcu.table_name,
      kcu.column_name,
      cols.is_nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    join information_schema.columns cols
      on cols.table_schema = kcu.table_schema
     and cols.table_name = kcu.table_name
     and cols.column_name = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'vehicles'
      and ccu.column_name = 'id'
      and not (
        kcu.table_schema = 'public'
        and kcu.table_name = 'reservations'
        and kcu.column_name = 'vehicle_id'
      )
  loop
    if ref.is_nullable = 'YES' then
      execute format('update %I.%I set %I = null where %I = $1', ref.table_schema, ref.table_name, ref.column_name, ref.column_name)
        using target_vehicle_id;
      get diagnostics affected = row_count;
      log := log || jsonb_build_array(jsonb_build_object('table', ref.table_schema || '.' || ref.table_name, 'column', ref.column_name, 'action', 'update_null', 'rows', affected));
    else
      execute format('delete from %I.%I where %I = $1', ref.table_schema, ref.table_name, ref.column_name)
        using target_vehicle_id;
      get diagnostics affected = row_count;
      log := log || jsonb_build_array(jsonb_build_object('table', ref.table_schema || '.' || ref.table_name, 'column', ref.column_name, 'action', 'delete_refs', 'rows', affected));
    end if;
  end loop;

  if to_regclass('public.cross_return_dests') is not null
     and public._bcr_column_exists('cross_return_dests', 'vehicle_id') then
    execute 'delete from public.cross_return_dests where vehicle_id = $1'
      using target_vehicle_id;
    get diagnostics affected = row_count;
    log := log || jsonb_build_array(jsonb_build_object('table', 'public.cross_return_dests', 'action', 'delete_refs', 'rows', affected));
  end if;

  if to_regclass('public.cross_returns') is not null
     and public._bcr_column_exists('cross_returns', 'vehicle_id') then
    execute 'update public.cross_returns set vehicle_id = null where vehicle_id = $1'
      using target_vehicle_id;
    get diagnostics affected = row_count;
    log := log || jsonb_build_array(jsonb_build_object('table', 'public.cross_returns', 'action', 'update_null', 'rows', affected));
  end if;

  delete from public.vehicles where id = target_vehicle_id;
  get diagnostics affected = row_count;

  return jsonb_build_object(
    'success', true,
    'mode', case when affected = 1 then 'deleted' else 'not_found' end,
    'deletedRows', affected,
    'log', log
  );
exception when others then
  return jsonb_build_object(
    'success', false,
    'mode', 'error',
    'sqlstate', sqlstate,
    'error', sqlerrm,
    'log', log
  );
end;
$$;

revoke all on function public._bcr_column_exists(text, text) from public, anon, authenticated;
grant execute on function public._bcr_column_exists(text, text) to service_role;

revoke all on function public.master_force_delete_vehicle(uuid) from public, anon, authenticated;
grant execute on function public.master_force_delete_vehicle(uuid) to service_role;
