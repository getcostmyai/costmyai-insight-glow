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
    VALUES ('referral_click', 1),
           ('estimator_viewed', 2),
           ('estimator_engaged', 3),
           ('estimator_completed', 4),
           ('workspace_created', 5),
           ('plan_changed', 6),
           ('switch_activated', 7)
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

CREATE OR REPLACE FUNCTION public.funnel_summary_platform(_window_days integer DEFAULT 30)
RETURNS TABLE(stage text, stage_order integer, visitors bigint, rate_from_previous_pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT public.is_platform_admin() AS ok
  ),
  stage_def(stage, stage_order) AS (
    VALUES ('referral_click', 1),
           ('estimator_viewed', 2),
           ('estimator_engaged', 3),
           ('estimator_completed', 4),
           ('workspace_created', 5),
           ('plan_changed', 6),
           ('switch_activated', 7)
  ),
  lead AS (
    SELECT e.event_type AS stage, count(DISTINCT e.visitor_id) AS visitors
    FROM public.lead_events e
    WHERE e.created_at >= now() - make_interval(days => _window_days)
      AND e.is_synthetic = false
    GROUP BY 1
  ),
  sw AS (
    SELECT 'switch_activated'::text AS stage, count(DISTINCT o.first_visitor_id) AS visitors
    FROM public.switch_events s
    JOIN public.organizations o
      ON o.id = s.org_id AND o.is_synthetic = false
     AND o.first_visitor_id IS NOT NULL
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

REVOKE ALL ON FUNCTION public.funnel_summary_for_partner(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funnel_summary_for_partner(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.funnel_summary_platform(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funnel_summary_platform(integer) TO authenticated, service_role;