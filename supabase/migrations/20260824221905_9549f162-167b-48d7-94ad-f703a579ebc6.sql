-- Dispatch 236. Pre-switch cache mix, per switch.
--
-- Why raw pairs are returned instead of a filtered pair: alias resolution
-- (model_aliases + catalog + PROVIDER_HOSTS) lives in TypeScript and is not
-- callable from SQL. Grouping by the raw reported pair lets the caller match
-- with the SAME resolver the rest of the savings path uses, instead of a
-- second, divergent normalizer in SQL.
--
-- Window: [lower_bound, s.activated_at), where lower_bound is the terminal
-- timestamp of the previous switch that moved the same FROM pair (compared on
-- trimmed/lowercased strings — a miss only widens the window, it never
-- attributes another switch's traffic to this one).
CREATE OR REPLACE FUNCTION public.switch_savings_prior_basis(
  _org_id uuid,
  _switch_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(
  switch_id uuid,
  model_key text,
  host text,
  events bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  window_start timestamptz,
  window_end timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH target AS (
    SELECT s.id,
           s.activated_at,
           lower(btrim(s.from_model)) AS from_model,
           lower(btrim(s.from_host))  AS from_host
      FROM public.switches s
     WHERE s.org_id = _org_id
       AND (_switch_ids IS NULL OR s.id = ANY(_switch_ids))
  ),
  bounded AS (
    SELECT t.id,
           t.activated_at,
           (
             SELECT max(greatest(p.activated_at, p.updated_at))
               FROM public.switches p
              WHERE p.org_id = _org_id
                AND p.id <> t.id
                AND p.activated_at < t.activated_at
                AND lower(btrim(p.from_model)) = t.from_model
                AND lower(btrim(p.from_host))  = t.from_host
           ) AS prior_end
      FROM target t
  )
  SELECT b.id,
         e.model_key,
         e.host,
         count(*)::bigint,
         sum(e.input_tokens)::bigint,
         sum(e.output_tokens)::bigint,
         sum(e.cache_read_tokens)::bigint,
         sum(e.cache_write_tokens)::bigint,
         b.prior_end,
         b.activated_at
    FROM bounded b
    JOIN public.usage_events e
      ON e.org_id = _org_id
     AND e.status = 'ok'
     AND NOT e.rerouted
     AND e.occurred_at < b.activated_at
     AND (b.prior_end IS NULL OR e.occurred_at >= b.prior_end)
   GROUP BY b.id, e.model_key, e.host, b.prior_end, b.activated_at
$function$;

REVOKE ALL ON FUNCTION public.switch_savings_prior_basis(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_savings_prior_basis(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_savings_prior_basis(uuid, uuid[]) TO service_role;