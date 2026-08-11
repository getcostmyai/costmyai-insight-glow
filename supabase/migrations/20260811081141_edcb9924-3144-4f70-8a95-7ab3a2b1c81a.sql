CREATE OR REPLACE FUNCTION public.workload_context_peaks(_org_id uuid, _since timestamptz)
RETURNS TABLE (
  model_key text,
  host text,
  task_hint text,
  peak_total_tokens bigint,
  events bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.model_key,
    e.host,
    e.task_hint,
    max(e.input_tokens + e.output_tokens)::bigint AS peak_total_tokens,
    count(*)::bigint AS events
  FROM public.usage_events e
  WHERE e.org_id = _org_id
    AND e.occurred_at >= _since
  GROUP BY e.model_key, e.host, e.task_hint
$$;

REVOKE ALL ON FUNCTION public.workload_context_peaks(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workload_context_peaks(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workload_context_peaks(uuid, timestamptz) TO service_role;