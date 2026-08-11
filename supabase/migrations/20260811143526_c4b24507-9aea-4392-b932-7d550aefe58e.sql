DROP FUNCTION IF EXISTS public.switch_savings_basis(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.switch_savings_basis(_org_id uuid, _switch_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(switch_id uuid, model_key text, host text, original_model_key text, original_host text, events bigint, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Dispatch 204. The cache mix travels with the workload so both sides of the
  -- counterfactual are priced over the same observed traffic. Pre-cache rows
  -- default to 0 and therefore reprice to exactly their previous figure.
  SELECT e.route_reason,
         e.model_key,
         e.host,
         e.original_model_key,
         e.original_host,
         count(*)::bigint,
         sum(e.input_tokens)::bigint,
         sum(e.output_tokens)::bigint,
         sum(e.cache_read_tokens)::bigint,
         sum(e.cache_write_tokens)::bigint
    FROM public.usage_events e
   WHERE e.org_id = _org_id
     AND e.rerouted
     AND e.status = 'ok'
     AND e.fallback_reason IS NULL
     AND e.route_reason IS NOT NULL
     AND (_switch_ids IS NULL OR e.route_reason = ANY(_switch_ids))
   GROUP BY 1, 2, 3, 4, 5
$function$;

REVOKE EXECUTE ON FUNCTION public.switch_savings_basis(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_savings_basis(uuid, uuid[]) TO authenticated, service_role;