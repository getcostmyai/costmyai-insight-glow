CREATE OR REPLACE VIEW public.funnel_summary
WITH (security_invoker = on) AS
WITH stage_def(stage, stage_order) AS (
  VALUES ('estimator_viewed', 1),
         ('estimator_engaged', 2),
         ('estimator_completed', 3),
         ('workspace_created', 4),
         ('plan_changed', 5),
         ('switch_activated', 6)
),
-- One independently planned scan per window: the planner then uses the
-- covering partial index for an index-only scan. A VALUES join over the
-- windows collapses into a nested loop + bitmap heap scan and is ~22x slower
-- at 500k rows (measured, not assumed).
lead AS (
  SELECT 7 AS window_days, e.event_type AS stage, count(DISTINCT e.visitor_id) AS visitors
  FROM public.lead_events e
  WHERE e.event_type IN ('estimator_viewed','estimator_engaged','estimator_completed','workspace_created','plan_changed')
    AND e.created_at >= now() - interval '7 days' AND e.is_synthetic = false
  GROUP BY 1, 2
  UNION ALL
  SELECT 30, e.event_type, count(DISTINCT e.visitor_id)
  FROM public.lead_events e
  WHERE e.event_type IN ('estimator_viewed','estimator_engaged','estimator_completed','workspace_created','plan_changed')
    AND e.created_at >= now() - interval '30 days' AND e.is_synthetic = false
  GROUP BY 1, 2
  UNION ALL
  SELECT 90, e.event_type, count(DISTINCT e.visitor_id)
  FROM public.lead_events e
  WHERE e.event_type IN ('estimator_viewed','estimator_engaged','estimator_completed','workspace_created','plan_changed')
    AND e.created_at >= now() - interval '90 days' AND e.is_synthetic = false
  GROUP BY 1, 2
),
sw AS (
  SELECT 7 AS window_days, 'switch_activated'::text AS stage, count(DISTINCT o.first_visitor_id) AS visitors
  FROM public.switch_events s
  JOIN public.organizations o ON o.id = s.org_id AND o.is_synthetic = false AND o.first_visitor_id IS NOT NULL
  WHERE s.event IN ('activated','activated_autonomous') AND s.is_synthetic = false
    AND s.created_at >= now() - interval '7 days'
  UNION ALL
  SELECT 30, 'switch_activated', count(DISTINCT o.first_visitor_id)
  FROM public.switch_events s
  JOIN public.organizations o ON o.id = s.org_id AND o.is_synthetic = false AND o.first_visitor_id IS NOT NULL
  WHERE s.event IN ('activated','activated_autonomous') AND s.is_synthetic = false
    AND s.created_at >= now() - interval '30 days'
  UNION ALL
  SELECT 90, 'switch_activated', count(DISTINCT o.first_visitor_id)
  FROM public.switch_events s
  JOIN public.organizations o ON o.id = s.org_id AND o.is_synthetic = false AND o.first_visitor_id IS NOT NULL
  WHERE s.event IN ('activated','activated_autonomous') AND s.is_synthetic = false
    AND s.created_at >= now() - interval '90 days'
),
counted AS (
  SELECT w.window_days, d.stage, d.stage_order,
         coalesce(l.visitors, s.visitors, 0)::bigint AS visitors
  FROM (VALUES (7), (30), (90)) AS w(window_days)
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

CREATE OR REPLACE FUNCTION public.funnel_summary_for_partner(_partner_id uuid, _window_days integer DEFAULT 30)
RETURNS TABLE(stage text, stage_order integer, visitors bigint, rate_from_previous_pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT public.is_partner_member(_partner_id) OR public.is_platform_admin() AS ok
  ),
  stage_def(stage, stage_order) AS (
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
      ON o.id = s.org_id AND o.is_synthetic = false
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
  SELECT c.stage,
         c.stage_order,
         c.visitors,
         CASE
           WHEN lag(c.visitors) OVER (ORDER BY c.stage_order) IS NULL THEN NULL
           WHEN lag(c.visitors) OVER (ORDER BY c.stage_order) = 0 THEN NULL
           ELSE round(c.visitors::numeric * 100 / lag(c.visitors) OVER (ORDER BY c.stage_order), 1)
         END
  FROM counted c
  CROSS JOIN allowed a
  WHERE a.ok
  ORDER BY c.stage_order;
$function$;