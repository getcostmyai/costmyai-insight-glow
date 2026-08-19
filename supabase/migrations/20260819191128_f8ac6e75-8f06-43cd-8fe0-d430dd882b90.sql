-- 1. Suppress the raw sub-floor count in benchmark_cut itself.
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
  SELECT CASE WHEN count(*) >= public.benchmark_k_floor() THEN count(*)::integer ELSE 0 END,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.25) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.50) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END,
         CASE WHEN count(*) >= public.benchmark_k_floor() THEN round(percentile_cont(0.75) WITHIN GROUP (ORDER BY monthly_usd)::numeric, 2) END
  FROM cut;
$function$;

-- 2. No arbitrary-cell access for ordinary callers.
REVOKE ALL ON FUNCTION public.benchmark_cut(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.benchmark_cut(text, text, text) TO service_role;

-- 3. Caller-scoped wrapper: zero free profile parameters, whole widening
--    ladder resolved server-side, exactly one cohort ever returned.
CREATE OR REPLACE FUNCTION public.benchmark_cut_self(_org_id uuid)
RETURNS TABLE(
  industry text,
  use_case text,
  revenue_band text,
  granularity integer,
  widened boolean,
  company_count integer,
  p25_usd numeric,
  p50_usd numeric,
  p75_usd numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _floor integer := public.benchmark_k_floor();
  _p record;
  _ind text;
  _uc text;
  _rb text;
  _cand record;
  _i integer := 0;
  _row record;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  SELECT p.industry, p.use_case::text AS use_case, p.revenue_band
    INTO _p
  FROM public.org_profiles p
  WHERE p.org_id = _org_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  _ind := nullif(btrim(coalesce(_p.industry, '')), '');
  _rb  := nullif(btrim(coalesce(_p.revenue_band, '')), '');
  -- "other" is free text at signup: it can label a company, never a cohort.
  _uc  := CASE WHEN _p.use_case IN ('customer_facing','internal','both') THEN _p.use_case END;

  FOR _cand IN
    SELECT * FROM (
      VALUES
        (1, _ind,  _uc,  _rb),
        (2, NULL::text, _uc, _rb),
        (3, NULL::text, NULL::text, _rb),
        (4, NULL::text, _uc, NULL::text)
    ) AS c(ord, ind, uc, rb)
    ORDER BY ord
  LOOP
    CONTINUE WHEN (_cand.ind IS NULL AND _cand.uc IS NULL AND _cand.rb IS NULL);
    _i := _i + 1;

    SELECT * INTO _row
    FROM public.benchmark_cut(_cand.ind, _cand.uc, _cand.rb);

    IF _row.company_count >= _floor THEN
      industry := _cand.ind;
      use_case := _cand.uc;
      revenue_band := _cand.rb;
      granularity := (CASE WHEN _cand.ind IS NULL THEN 0 ELSE 1 END)
                   + (CASE WHEN _cand.uc  IS NULL THEN 0 ELSE 1 END)
                   + (CASE WHEN _cand.rb  IS NULL THEN 0 ELSE 1 END);
      widened := _i > 1;
      company_count := _row.company_count;
      p25_usd := _row.p25_usd;
      p50_usd := _row.p50_usd;
      p75_usd := _row.p75_usd;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  -- Nothing cleared the floor: an honest refusal, with no count to subtract.
  industry := NULL; use_case := NULL; revenue_band := NULL;
  granularity := 0; widened := false; company_count := 0;
  p25_usd := NULL; p50_usd := NULL; p75_usd := NULL;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.benchmark_cut_self(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.benchmark_cut_self(uuid) TO authenticated, service_role;