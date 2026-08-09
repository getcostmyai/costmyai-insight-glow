CREATE OR REPLACE FUNCTION public.switch_savings_basis(_org_id uuid, _switch_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  switch_id uuid,
  model_key text,
  host text,
  original_model_key text,
  original_host text,
  events bigint,
  input_tokens bigint,
  output_tokens bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.route_reason,
         e.model_key,
         e.host,
         e.original_model_key,
         e.original_host,
         count(*)::bigint,
         sum(e.input_tokens)::bigint,
         sum(e.output_tokens)::bigint
    FROM public.usage_events e
   WHERE e.org_id = _org_id
     AND e.rerouted
     AND e.status = 'ok'
     AND e.fallback_reason IS NULL
     AND e.route_reason IS NOT NULL
     AND (_switch_ids IS NULL OR e.route_reason = ANY(_switch_ids))
   GROUP BY 1, 2, 3, 4, 5
$$;

GRANT EXECUTE ON FUNCTION public.switch_savings_basis(uuid, uuid[]) TO authenticated, service_role;