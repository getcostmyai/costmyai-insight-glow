ALTER TABLE public.lead_events ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lead_events_real_type_idx
  ON public.lead_events (event_type, created_at DESC)
  WHERE is_synthetic = false;

-- The RLS policy "Platform admins read lead events" already existed, but the
-- table was never granted to authenticated, so the policy could never fire.
GRANT SELECT ON public.lead_events TO authenticated;

CREATE OR REPLACE VIEW public.funnel_summary
WITH (security_invoker = on) AS
WITH win(window_days) AS (VALUES (7), (30), (90)),
stage_def(stage, stage_order) AS (
  VALUES ('estimator_viewed', 1),
         ('estimator_engaged', 2),
         ('estimator_completed', 3),
         ('workspace_created', 4),
         ('plan_changed', 5),
         ('switch_activated', 6)
),
lead AS (
  SELECT w.window_days, e.event_type AS stage, count(DISTINCT e.visitor_id) AS visitors
  FROM win w
  JOIN public.lead_events e
    ON e.event_type IN ('estimator_viewed','estimator_engaged','estimator_completed','workspace_created','plan_changed')
   AND e.created_at >= now() - make_interval(days => w.window_days)
   AND e.is_synthetic = false
  GROUP BY 1, 2
),
sw AS (
  SELECT w.window_days, 'switch_activated'::text AS stage, count(DISTINCT o.first_visitor_id) AS visitors
  FROM win w
  JOIN public.switch_events s
    ON s.event IN ('activated','activated_autonomous')
   AND s.created_at >= now() - make_interval(days => w.window_days)
   AND s.is_synthetic = false
  JOIN public.organizations o
    ON o.id = s.org_id AND o.is_synthetic = false AND o.first_visitor_id IS NOT NULL
  GROUP BY 1, 2
),
counted AS (
  SELECT w.window_days, d.stage, d.stage_order,
         coalesce(l.visitors, s.visitors, 0)::bigint AS visitors
  FROM win w
  CROSS JOIN stage_def d
  LEFT JOIN lead l ON l.window_days = w.window_days AND l.stage = d.stage
  LEFT JOIN sw   s ON s.window_days = w.window_days AND s.stage = d.stage
)
SELECT window_days,
       stage,
       stage_order,
       visitors,
       CASE
         WHEN lag(visitors) OVER (PARTITION BY window_days ORDER BY stage_order) IS NULL THEN NULL
         WHEN lag(visitors) OVER (PARTITION BY window_days ORDER BY stage_order) = 0 THEN NULL
         ELSE round(visitors::numeric * 100 / lag(visitors) OVER (PARTITION BY window_days ORDER BY stage_order), 1)
       END AS rate_from_previous_pct
FROM counted
ORDER BY window_days, stage_order;

GRANT SELECT ON public.funnel_summary TO authenticated;

CREATE OR REPLACE FUNCTION public.funnel_summary_for_partner(_partner_id uuid, _window_days integer DEFAULT 30)
RETURNS TABLE(stage text, stage_order integer, visitors bigint, rate_from_previous_pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH stage_def(stage, stage_order) AS (
    VALUES ('estimator_viewed', 1),
           ('estimator_engaged', 2),
           ('estimator_completed', 3),
           ('workspace_created', 4),
           ('plan_changed', 5),
           ('switch_activated', 6)
  ),
  lead AS (
    SELECT e.event_type AS stage, count(DISTINCT e.visitor_id) AS visitors
    FROM public.lead_events e
    WHERE e.referred_by_partner_id = _partner_id
      AND e.created_at >= now() - make_interval(days => _window_days)
      AND e.is_synthetic = false
    GROUP BY 1
  ),
  sw AS (
    SELECT 'switch_activated'::text AS stage, count(DISTINCT o.first_visitor_id) AS visitors
    FROM public.switch_events s
    JOIN public.organizations o
      ON o.id = s.org_id
     AND o.is_synthetic = false
     AND o.first_visitor_id IS NOT NULL
     AND o.referred_by_partner_id = _partner_id
    WHERE s.event IN ('activated','activated_autonomous')
      AND s.created_at >= now() - make_interval(days => _window_days)
      AND s.is_synthetic = false
  ),
  counted AS (
    SELECT d.stage, d.stage_order, coalesce(l.visitors, s.visitors, 0)::bigint AS visitors
    FROM stage_def d
    LEFT JOIN lead l ON l.stage = d.stage
    LEFT JOIN sw   s ON s.stage = d.stage
  )
  SELECT stage,
         stage_order,
         visitors,
         CASE
           WHEN lag(visitors) OVER (ORDER BY stage_order) IS NULL THEN NULL
           WHEN lag(visitors) OVER (ORDER BY stage_order) = 0 THEN NULL
           ELSE round(visitors::numeric * 100 / lag(visitors) OVER (ORDER BY stage_order), 1)
         END
  FROM counted
  ORDER BY stage_order;
$function$;

REVOKE ALL ON FUNCTION public.funnel_summary_for_partner(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funnel_summary_for_partner(uuid, integer) TO authenticated, service_role;