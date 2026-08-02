CREATE OR REPLACE FUNCTION public.backup_export_sql()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _tables text[] := ARRAY['organizations','subscriptions','commission_ledger','monthly_kpi_snapshot','price_history'];
  _out text := '';
  _t text;
  _cols text;
  _vals text;
  _row record;
  _r record;
BEGIN
  _out := _out || '-- CostMyAI off-platform logical export' || E'\n';
  _out := _out || '-- generated_at: ' || now()::text || E'\n';
  _out := _out || '-- tables: ' || array_to_string(_tables, ', ') || E'\n';
  _out := _out || 'BEGIN;' || E'\n\n';

  -- 1. enum types used by the exported tables
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

  -- 2. trigger functions
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

  -- 3. table structure
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

    -- primary key / unique / check constraints (foreign keys intentionally omitted:
    -- the export is a standalone subset and must restore without unexported parents)
    FOR _r IN
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = ('public.' || quote_ident(_t))::regclass AND contype IN ('p','u','c')
      ORDER BY contype
    LOOP
      _out := _out || 'ALTER TABLE public.' || quote_ident(_t)
           || ' ADD CONSTRAINT ' || quote_ident(_r.conname) || ' ' || _r.def || ';' || E'\n';
    END LOOP;

    -- indexes (excluding those backing constraints)
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

  -- 4. data, inserted BEFORE triggers are attached so append-only rules
  --    do not fight the restore itself
  _out := _out || '-- === data ===' || E'\n';
  FOREACH _t IN ARRAY _tables LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
      INTO _cols
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident(_t))::regclass
       AND a.attnum > 0 AND NOT a.attisdropped;

    _out := _out || '-- ' || _t || E'\n';
    FOR _row IN EXECUTE format('SELECT to_jsonb(x) AS j FROM public.%I x', _t) LOOP
      SELECT string_agg(
               CASE WHEN _row.j ->> a.attname IS NULL THEN 'NULL'
                    ELSE quote_literal(_row.j ->> a.attname) END,
               ', ' ORDER BY a.attnum)
        INTO _vals
        FROM pg_attribute a
       WHERE a.attrelid = ('public.' || quote_ident(_t))::regclass
         AND a.attnum > 0 AND NOT a.attisdropped;

      _out := _out || 'INSERT INTO public.' || quote_ident(_t) || ' (' || _cols
           || ') VALUES (' || _vals || ');' || E'\n';
    END LOOP;
    _out := _out || E'\n';
  END LOOP;

  -- 5. triggers last, so the restored copy carries the same guarantees
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

REVOKE ALL ON FUNCTION public.backup_export_sql() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_sql() TO service_role;

CREATE OR REPLACE FUNCTION public.backup_export_counts()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'captured_at', now(),
    'organizations', (SELECT count(*) FROM public.organizations),
    'subscriptions', (SELECT count(*) FROM public.subscriptions),
    'commission_ledger', (SELECT count(*) FROM public.commission_ledger),
    'monthly_kpi_snapshot', (SELECT count(*) FROM public.monthly_kpi_snapshot),
    'price_history', (SELECT count(*) FROM public.price_history)
  );
$fn$;

REVOKE ALL ON FUNCTION public.backup_export_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export_counts() TO service_role;

CREATE TABLE IF NOT EXISTS public.backup_export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean,
  destination text,
  object_key text,
  bytes bigint,
  row_counts jsonb,
  pruned_keys integer NOT NULL DEFAULT 0,
  error text
);

GRANT ALL ON public.backup_export_runs TO service_role;
ALTER TABLE public.backup_export_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins can read backup runs"
  ON public.backup_export_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());