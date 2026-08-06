-- Dispatch 123. Platform-wide benchmark eligibility, used to decide whether the
-- four optional profiling questions are worth asking at all. Same population
-- benchmark_cut draws its cohorts from, with no cut filters applied: profiled,
-- non-synthetic, quality-clean companies with real 30-day spend.
CREATE OR REPLACE FUNCTION public.benchmark_ask_threshold()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT 25 $$;

REVOKE ALL ON FUNCTION public.benchmark_ask_threshold() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.benchmark_ask_threshold() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.benchmark_eligible_companies()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH spend AS (
    SELECT p.org_id, sum(r.cost_usd) AS monthly_usd
    FROM public.org_profiles p
    JOIN public.organizations o ON o.id = p.org_id AND o.is_synthetic = false
    JOIN public.usage_rollups r ON r.org_id = p.org_id
      AND r.granularity = 'day'
      AND r.is_synthetic = false
      AND r.bucket_start >= now() - interval '30 days'
    WHERE p.quality_flag IS NULL
    GROUP BY 1
    HAVING sum(r.cost_usd) > 0
  )
  SELECT count(*)::integer FROM spend;
$$;

REVOKE ALL ON FUNCTION public.benchmark_eligible_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.benchmark_eligible_companies() TO authenticated, service_role;