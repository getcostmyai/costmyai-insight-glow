ALTER TABLE public.usage_rollups ADD COLUMN IF NOT EXISTS peak_total_tokens integer;

UPDATE public.usage_rollups r
SET peak_total_tokens = a.peak
FROM (
  SELECT org_id,
         date_trunc('day', occurred_at) AS bucket_start,
         'day'::text AS granularity,
         model_key, host, task_hint,
         max(input_tokens + output_tokens) AS peak
  FROM public.usage_events
  GROUP BY 1,2,3,4,5,6
  UNION ALL
  SELECT org_id,
         date_trunc('hour', occurred_at) AS bucket_start,
         'hour'::text AS granularity,
         model_key, host, task_hint,
         max(input_tokens + output_tokens) AS peak
  FROM public.usage_events
  GROUP BY 1,2,3,4,5,6
) a
WHERE r.org_id = a.org_id
  AND r.bucket_start = a.bucket_start
  AND r.granularity = a.granularity
  AND r.model_key = a.model_key
  AND r.host = a.host
  AND r.task_hint = a.task_hint;

CREATE OR REPLACE FUNCTION public.workload_context_peaks(_org_id uuid, _since timestamp with time zone)
RETURNS TABLE(model_key text, host text, task_hint text, peak_total_tokens bigint, events bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    r.model_key,
    r.host,
    r.task_hint,
    max(r.peak_total_tokens)::bigint AS peak_total_tokens,
    sum(r.requests)::bigint AS events
  FROM public.usage_rollups r
  WHERE r.org_id = _org_id
    AND r.granularity = 'day'
    AND r.bucket_start >= date_trunc('day', _since)
  GROUP BY r.model_key, r.host, r.task_hint
$function$;

ALTER TABLE public.usage_events SET (
  autovacuum_vacuum_insert_scale_factor = 0.01,
  autovacuum_vacuum_insert_threshold = 5000,
  autovacuum_analyze_scale_factor = 0.02
);