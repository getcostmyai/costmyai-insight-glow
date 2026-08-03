CREATE TYPE public.ai_use_case AS ENUM ('customer_facing','internal','both','other');
CREATE TYPE public.deployment_maturity AS ENUM ('pilot','production');

CREATE TABLE public.org_profiles (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  use_case public.ai_use_case NOT NULL,
  use_case_other text,
  industry text NOT NULL,
  revenue_band text,
  headcount_band text,
  customer_facing boolean,
  maturity public.deployment_maturity,
  quality_flag text,
  primer_seen_at timestamptz,
  benchmark_prompt_dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.org_profiles TO authenticated;
GRANT ALL ON public.org_profiles TO service_role;

ALTER TABLE public.org_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read their workspace profile"
  ON public.org_profiles FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "managers create their workspace profile"
  ON public.org_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_org_manager(org_id));

CREATE POLICY "managers update their workspace profile"
  ON public.org_profiles FOR UPDATE TO authenticated
  USING (public.is_org_manager(org_id))
  WITH CHECK (public.is_org_manager(org_id));

CREATE TRIGGER org_profiles_touch
  BEFORE UPDATE ON public.org_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cohort aggregate. Returns the number of distinct real companies behind a cut
-- plus their monthly spend spread. The k-anonymity floor is applied by the
-- application before anything is rendered; the spend figures here are NULL
-- unless the cohort already has at least five companies, so a small cut cannot
-- leak one company's bill even if a caller ignores the application rule.
CREATE OR REPLACE FUNCTION public.benchmark_cut(
  _industry text DEFAULT NULL,
  _use_case text DEFAULT NULL,
  _revenue_band text DEFAULT NULL
)
RETURNS TABLE(company_count integer, p25_usd numeric, p50_usd numeric, p75_usd numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
         CASE WHEN count(*) >= 5 THEN round(percentile_cont(0.25) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= 5 THEN round(percentile_cont(0.50) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= 5 THEN round(percentile_cont(0.75) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END
  FROM cut;
$$;

REVOKE ALL ON FUNCTION public.benchmark_cut(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.benchmark_cut(text, text, text) TO authenticated, service_role;