CREATE OR REPLACE FUNCTION public.schema_filter_state(_predicates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cols jsonb := '[]'::jsonb;
  live jsonb := '[]'::jsonb;
  rec record;
  predicate text;
  hit boolean;
begin
  for rec in
    select c.relname as table_name, a.attname as column_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0
      and not a.attisdropped
      and a.attname in (select jsonb_object_keys(_predicates))
    order by c.relname, a.attname
  loop
    cols := cols || jsonb_build_array(
      jsonb_build_object('table', rec.table_name, 'column', rec.column_name));

    predicate := _predicates ->> rec.column_name;
    if predicate !~ '^[a-z_]+ (is false|is true|is not null|is null)$' then
      raise exception 'unsupported predicate %', predicate;
    end if;
    -- The check only ever asks "has this dormant state gone live?", which is an
    -- existence question. count(*) answered it by reading every row of the
    -- largest table on the platform (usage_events, 5.3M rows) and timed out;
    -- exists stops at the first matching row.
    execute format('select exists(select 1 from public.%I where %s)', rec.table_name, predicate) into hit;
    if hit then
      live := live || jsonb_build_array(rec.table_name || '.' || rec.column_name);
    end if;
  end loop;

  return jsonb_build_object('columns', cols, 'live', live);
end;
$function$;