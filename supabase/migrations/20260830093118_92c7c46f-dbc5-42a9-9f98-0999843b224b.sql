-- Fix: backup_export_sql() timed out against real production data volume
-- because it was one monolithic PL/pgSQL statement building types + trigger
-- functions + table structure + every row of all 5 DR tables in a single
-- call. Postgres's statement_timeout applies to that whole call as one
-- indivisible unit with no partial output on kill -- at production row
-- counts it was killed with nothing produced at all. It also re-queried
-- pg_attribute on every single row instead of once per table, adding
-- avoidable per-row catalog overhead on top of the structural problem.
--
-- Fix: split into three bounded/catalog-only calls (schema, triggers) plus a
-- keyset-paginated per-table data call that the caller drives page-by-page --
-- the same walk-until-short-page convention src/lib/paginate.server.ts
-- already uses for PostgREST's 1000-row page ceiling, applied here to stay
-- under the statement-timeout ceiling instead. Table size can no longer
-- determine whether the export completes, only how many round trips it takes.

DROP FUNCTION IF EXISTS public.backup_export_sql();

-- 1. Schema section: types, trigger functions, table/constraint/index DDL.
--    Catalog-metadata-only, no row data -- cheap and bounded regardless of
--    table size.
CREATE OR REPLACE FUNCTION public.backup_export_schema_sql()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _tables text[] := ARRAY['organizations','subscriptions','commission_ledger','monthly_kpi_snapshot','price_history'];
  _out text := '';
  _t text;
  _r record;
BEGIN
  _out := _out || '-- CostMyAI off-platform logical export' || E'\n';
  _out := _out || '-- generated_at: ' || now()::text || E'\n';
  _out := _out || '-- tables: ' || array_to_string(_tables, ', ') || E'\n';
  _out := _out || 'BEGIN;' || E'\n\n';

  -- types used by the exported tables
  _out := _out || '-- === types ===' || E'\n';
  FOR _r IN
    SELECT DISTINCT t.typname,
           (SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
              FROM pg_enum e WHERE e.enumtypid = t.oid) AS labels
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public' AND c.relname = ANY(_tables)
      AND a.attnum > 0 AND NOT a.attisdropped AND t.typtype = 'e'
  LOOP
    _out := _out || 'DO $do$ BEGIN CREATE TYPE public.' || quote_ident(_r.typname)
         || ' AS ENUM (' || _r.labels || '); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;' || E'\n';
  END LOOP;

  -- trigger functions
  _out := _out || E'\n-- === trigger functions ===' || E'\n';
  FOR _r IN
    SELECT DISTINCT pg_get_functiondef(p.oid) AS def
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE n.nspname = 'public' AND c.relname = ANY(_tables) AND NOT tg.tgisinternal
  LOOP
    _out := _out || _r.def || ';' || E'\n\n';
  END LOOP;

  -- table structure
  _out := _out || '-- === tables ===' || E'\n';
  FOREACH _t IN ARRAY _tables LOOP
    _out := _out || 'CREATE TABLE IF NOT EXISTS public.' || quote_ident(_t) || ' (' || E'\n  '
      || (SELECT string_agg(
            quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
            || CASE WHEN pg_get_expr(d.adbin, d.adrelid) IS NOT NULL
                    THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END
            || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
            ',' || E'\n  ' ORDER BY a.attnum)
          FROM pg_attribute a
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = ('public.' || quote_ident(_t))::regclass
            AND a.attnum > 0 AND NOT a.attisdropped)
      || E'\n);' || E'\n';

    FOR _r IN
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = ('public.' || quote_ident(_t))::regclass AND contype IN ('p','u','c')
      ORDER BY contype
    LOOP
      _out := _out || 'ALTER TABLE public.' || quote_ident(_t)
           || ' ADD CONSTRAINT ' || quote_ident(_r.conname) || ' ' || _r.def || ';' || E'\n';
    END LOOP;

    FOR _r IN
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = _t
        AND indexname NOT IN (SELECT conname FROM pg_constraint
                              WHERE conrelid = ('public.' || quote_ident(_t))::regclass)
    LOOP
      _out := _out || replace(_r.indexdef, 'CREATE INDEX', 'CREATE INDEX IF NOT EXISTS') || ';' || E'\n';
    END LOOP;
    _out := _out || E'\n';
  END LOOP;

  _out := _out || '-- === data ===' || E'\n';
  RETURN _out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backup_export_schema_sql() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_schema_sql() TO service_role;


-- 2. One bounded page of INSERT statements for one table, keyset-paginated
--    by id (all 5 DR tables have `id uuid PRIMARY KEY`). Caller pages until
--    row_count < _page_size, mirroring fetchAllRows's short-page stop
--    condition in src/lib/paginate.server.ts.
CREATE OR REPLACE FUNCTION public.backup_export_table_page_sql(_table text, _after uuid, _page_size int DEFAULT 500)
RETURNS TABLE(chunk_sql text, last_id uuid, row_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _tables text[] := ARRAY['organizations','subscriptions','commission_ledger','monthly_kpi_snapshot','price_history'];
  _colnames text[];
  _cols text;
  _out text := '';
  _n int := 0;
  _last uuid;
  _row record;
  _vals text;
BEGIN
  IF NOT (_table = ANY(_tables)) THEN
    RAISE EXCEPTION 'backup_export_table_page_sql: % is not one of the exported DR tables', _table;
  END IF;

  SELECT array_agg(a.attname ORDER BY a.attnum)
    INTO _colnames
    FROM pg_attribute a
   WHERE a.attrelid = ('public.' || quote_ident(_table))::regclass
     AND a.attnum > 0 AND NOT a.attisdropped;

  SELECT string_agg(quote_ident(c), ', ') INTO _cols FROM unnest(_colnames) AS c;

  FOR _row IN EXECUTE format(
    'SELECT id, to_jsonb(x) AS j FROM public.%I x WHERE ($1 IS NULL OR id > $1) ORDER BY id LIMIT $2',
    _table
  ) USING _after, _page_size
  LOOP
    SELECT string_agg(
             CASE WHEN _row.j ->> u.c IS NULL THEN 'NULL' ELSE quote_literal(_row.j ->> u.c) END,
             ', ' ORDER BY u.ord)
      INTO _vals
      FROM unnest(_colnames) WITH ORDINALITY AS u(c, ord);

    _out := _out || 'INSERT INTO public.' || quote_ident(_table) || ' (' || _cols
         || ') VALUES (' || _vals || ');' || E'\n';
    _n := _n + 1;
    _last := _row.id;
  END LOOP;

  RETURN QUERY SELECT _out, _last, _n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backup_export_table_page_sql(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_table_page_sql(text, uuid, int) TO service_role;


-- 3. Trailer: triggers last (so the restored copy inherits the append-only
--    guarantee, not just the data) + COMMIT. Catalog-only, cheap.
CREATE OR REPLACE FUNCTION public.backup_export_triggers_sql()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _tables text[] := ARRAY['organizations','subscriptions','commission_ledger','monthly_kpi_snapshot','price_history'];
  _out text := '';
  _r record;
BEGIN
  _out := _out || '-- === triggers (append-only guarantees) ===' || E'\n';
  FOR _r IN
    SELECT pg_get_triggerdef(tg.oid) AS def
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(_tables) AND NOT tg.tgisinternal
    ORDER BY c.relname, tg.tgname
  LOOP
    _out := _out || _r.def || ';' || E'\n';
  END LOOP;

  _out := _out || E'\nCOMMIT;' || E'\n';
  RETURN _out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backup_export_triggers_sql() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_triggers_sql() TO service_role;