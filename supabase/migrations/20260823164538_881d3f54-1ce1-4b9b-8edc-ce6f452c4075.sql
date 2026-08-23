GRANT SELECT ON public.lead_events TO authenticated;

CREATE OR REPLACE FUNCTION public.funnel_summary_platform(_window_days integer DEFAULT 30)
RETURNS TABLE(stage text, stage_order integer, visitors bigint, rate_from_previous_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT public.is_platform_admin() AS ok
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

REVOKE ALL ON FUNCTION public.funnel_summary_platform(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funnel_summary_platform(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_event_breakdown(_window_days integer DEFAULT 30)
RETURNS TABLE(
  event_type text,
  events bigint,
  visitors bigint,
  sessions bigint,
  legacy_events bigint,
  first_at timestamptz,
  last_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.event_type,
         count(*)::bigint AS events,
         count(DISTINCT e.visitor_id)::bigint AS visitors,
         count(DISTINCT e.session_id)::bigint AS sessions,
         count(*) FILTER (WHERE e.session_id IS NULL)::bigint AS legacy_events,
         min(e.created_at) AS first_at,
         max(e.created_at) AS last_at
  FROM public.lead_events e
  CROSS JOIN LATERAL (SELECT public.is_platform_admin() AS ok) a
  WHERE a.ok
    AND e.is_synthetic = false
    AND e.created_at >= now() - make_interval(days => _window_days)
  GROUP BY e.event_type
  ORDER BY 2 DESC;
$function$;

REVOKE ALL ON FUNCTION public.lead_event_breakdown(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_event_breakdown(integer) TO authenticated, service_role;