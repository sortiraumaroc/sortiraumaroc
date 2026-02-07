-- Function to force-clean all FK dependencies on auth.users for a given user_id
-- Used by the admin bulk delete endpoint when standard delete fails due to FK constraints

begin;

create or replace function public.admin_force_delete_user_deps(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  rec record;
begin
  -- Find all foreign key constraints referencing auth.users that are NOT cascade/set null
  -- and delete matching rows from those tables
  for rec in
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.constraint_column_usage ccu
      on rc.unique_constraint_name = ccu.constraint_name
    where ccu.table_schema = 'auth'
      and ccu.table_name = 'users'
      and ccu.column_name = 'id'
      and tc.constraint_type = 'FOREIGN KEY'
      and rc.delete_rule not in ('CASCADE', 'SET NULL', 'SET DEFAULT')
  loop
    execute format(
      'DELETE FROM %I.%I WHERE %I = $1',
      rec.table_schema,
      rec.table_name,
      rec.column_name
    ) using target_user_id;
  end loop;

  -- Also handle text-type FK columns (some tables use text instead of uuid)
  for rec in
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.referential_constraints rc
      on tc.constraint_name = rc.constraint_name
    join information_schema.constraint_column_usage ccu
      on rc.unique_constraint_name = ccu.constraint_name
    where ccu.table_schema = 'auth'
      and ccu.table_name = 'users'
      and ccu.column_name = 'id'
      and tc.constraint_type = 'FOREIGN KEY'
      and rc.delete_rule not in ('CASCADE', 'SET NULL', 'SET DEFAULT')
  loop
    execute format(
      'DELETE FROM %I.%I WHERE %I = $1::text',
      rec.table_schema,
      rec.table_name,
      rec.column_name
    ) using target_user_id;
  end loop;
end;
$$;

commit;
