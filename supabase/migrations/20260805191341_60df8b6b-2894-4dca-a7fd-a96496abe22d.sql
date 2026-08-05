create or replace function public.schema_filter_state(_predicates jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cols jsonb;
  live jsonb := '[]'::jsonb;
  rec record;
  predicate text;
  cnt bigint;
begin
  select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name)
                            order by table_name, column_name), '[]'::jsonb)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and column_name in (select jsonb_object_keys(_predicates));

  for rec in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name in (select jsonb_object_keys(_predicates))
    order by table_name, column_name
  loop
    predicate := _predicates ->> rec.column_name;
    -- Only ever a simple predicate over the column being judged. Anything else
    -- is a caller bug, and this function is service_role-only regardless.
    if predicate !~ '^[a-z_]+ (is false|is true|is not null|is null)$' then
      raise exception 'unsupported predicate %', predicate;
    end if;
    execute format('select count(*) from public.%I where %s', rec.table_name, predicate) into cnt;
    if cnt > 0 then
      live := live || jsonb_build_array(rec.table_name || '.' || rec.column_name);
    end if;
  end loop;

  return jsonb_build_object('columns', cols, 'live', live);
end;
$$;

revoke all on function public.schema_filter_state(jsonb) from public, anon, authenticated;
grant execute on function public.schema_filter_state(jsonb) to service_role;