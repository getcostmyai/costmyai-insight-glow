CREATE OR REPLACE FUNCTION public.usage_collector_days(_org_id uuid, _since timestamptz)
RETURNS TABLE(day date, outcome text, runs bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (started_at AT TIME ZONE 'UTC')::date AS day,
         COALESCE(outcome, 'unknown') AS outcome,
         count(*) AS runs
  FROM public.sync_runs
  WHERE job = 'usage-tick'
    AND started_at >= _since
    AND detail->>'orgId' = _org_id::text
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.usage_collector_days(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_collector_days(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.usage_collector_days(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.usage_collector_days(uuid, timestamptz) TO service_role;