-- Dispatch 92: the privacy floor existed as the literal 5 in four places inside
-- benchmark_cut and again as a constant in the app. Give it one name.
CREATE OR REPLACE FUNCTION public.benchmark_k_floor()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT 5 $$;

REVOKE ALL ON FUNCTION public.benchmark_k_floor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.benchmark_k_floor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.benchmark_cut(_industry text DEFAULT NULL::text, _use_case text DEFAULT NULL::text, _revenue_band text DEFAULT NULL::text)
 RETURNS TABLE(company_count integer, p25_usd numeric, p50_usd numeric, p75_usd numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH spend AS (
    SELECT p.org_id,
           p.industry,
           p.use_case::text AS use_case,
           p.revenue_band,
           sum(r.cost_usd) AS monthly_usd
    FROM public.org_profiles p
    JOIN public.organizations o ON o.id = p.org_id AND o.is_synthetic = false
    JOIN public.usage_rollups r ON r.org_id = p.org_id
      AND r.granularity = 'day'
      AND r.is_synthetic = false
      AND r.bucket_start >= now() - interval '30 days'
    WHERE p.quality_flag IS NULL
    GROUP BY 1,2,3,4
    HAVING sum(r.cost_usd) > 0
  ), cut AS (
    SELECT * FROM spend s
    WHERE (_industry IS NULL OR s.industry = _industry)
      AND (_use_case IS NULL OR s.use_case = _use_case)
      AND (_revenue_band IS NULL OR s.revenue_band = _revenue_band)
  )
  SELECT count(*)::integer,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.25) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.50) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.75) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END
  FROM cut;
$function$;