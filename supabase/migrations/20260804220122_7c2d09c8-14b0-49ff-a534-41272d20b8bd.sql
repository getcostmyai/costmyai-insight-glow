CREATE OR REPLACE FUNCTION public.plan_rank(_plan plan_tier)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _plan WHEN 'compare' THEN 0 WHEN 'certify' THEN 1 WHEN 'rightsize' THEN 2 WHEN 'govern' THEN 3 END;
$$;

-- Backstop for the app-layer requirePlan gate: a paid level needs both the
-- workspace record and a live subscription to agree, in any environment.
CREATE OR REPLACE FUNCTION public.org_entitled_to(_org_id uuid, _required plan_tier)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN public.plan_rank(_required) = 0 THEN true
    ELSE
      COALESCE((SELECT public.plan_rank(o.plan) FROM public.organizations o WHERE o.id = _org_id), -1)
        >= public.plan_rank(_required)
      AND EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.org_id = _org_id
          AND public.plan_rank(s.plan) >= public.plan_rank(_required)
          AND (
            (s.status IN ('active','trialing','past_due')
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
            OR (s.status = 'canceled' AND s.current_period_end > now())
          )
      )
  END;
$$;

REVOKE ALL ON FUNCTION public.org_entitled_to(uuid, plan_tier) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_rank(plan_tier) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_switch(_rec_id uuid, _autonomous boolean DEFAULT false)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _rec public.recommendations%ROWTYPE;
  _switch_id uuid;
  _needed plan_tier;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _rec FROM public.recommendations WHERE id = _rec_id;
  IF _rec.id IS NULL THEN
    RAISE EXCEPTION 'recommendation not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_org_manager(_rec.org_id) THEN
    RAISE EXCEPTION 'recommendation not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF public.org_is_synthetic(_rec.org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Level gate, restated here so it holds for a direct database call too.
  _needed := CASE WHEN coalesce(_autonomous, false) THEN 'govern'::plan_tier ELSE 'rightsize'::plan_tier END;
  IF NOT public.org_entitled_to(_rec.org_id, _needed) THEN
    RAISE EXCEPTION 'this workspace is not on the % plan', _needed USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _rec.status <> 'open' THEN
    RAISE EXCEPTION 'that recommendation is no longer open' USING ERRCODE = 'check_violation';
  END IF;

  IF _rec.to_model IS NULL OR _rec.to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.switches s
    WHERE s.org_id = _rec.org_id
      AND s.from_model = _rec.from_model
      AND s.from_host = _rec.from_host
      AND s.status = 'active'
  ) THEN
    RAISE EXCEPTION 'that workload already has an active switch' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.switches (
    org_id, recommendation_id, from_model, from_host, to_model, to_host,
    basis, badge, autonomous, status, activated_by
  )
  VALUES (
    _rec.org_id, _rec.id, _rec.from_model, _rec.from_host, _rec.to_model, _rec.to_host,
    _rec.basis,
    CASE _rec.kind
      WHEN 'host_arbitrage' THEN 'Proven switch'
      WHEN 'rightsize'      THEN 'Right-sized'
      ELSE 'Equal-quality switch'
    END,
    coalesce(_autonomous, false), 'active', _uid
  )
  RETURNING id INTO _switch_id;

  UPDATE public.recommendations SET status = 'activated' WHERE id = _rec.id;

  INSERT INTO public.switch_events (switch_id, org_id, event, detail, actor)
  VALUES (
    _switch_id, _rec.org_id,
    CASE WHEN coalesce(_autonomous, false) THEN 'activated_autonomous' ELSE 'activated' END,
    _rec.from_model || '@' || _rec.from_host || ' -> ' || _rec.to_model || '@' || _rec.to_host,
    _uid
  );

  RETURN _switch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_switch_state(_switch_id uuid, _status switch_status, _reason text DEFAULT NULL::text)
 RETURNS switch_status LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sw public.switches%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _sw FROM public.switches WHERE id = _switch_id;
  IF _sw.id IS NULL OR NOT public.is_org_manager(_sw.org_id) THEN
    RAISE EXCEPTION 'switch not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF public.org_is_synthetic(_sw.org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Undoing is always allowed; putting traffic back on a switch is a paid action.
  IF _status = 'active' AND NOT public.org_entitled_to(
       _sw.org_id,
       CASE WHEN _sw.autonomous THEN 'govern'::plan_tier ELSE 'rightsize'::plan_tier END) THEN
    RAISE EXCEPTION 'this workspace is not on the required plan' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _sw.status = 'rolled_back' THEN
    RAISE EXCEPTION 'that switch was rolled back' USING ERRCODE = 'check_violation';
  END IF;
  IF _sw.status = _status THEN
    RETURN _sw.status;
  END IF;

  UPDATE public.switches SET status = _status WHERE id = _switch_id;

  IF _status = 'rolled_back' AND _sw.recommendation_id IS NOT NULL THEN
    UPDATE public.recommendations SET status = 'open' WHERE id = _sw.recommendation_id;
  END IF;

  INSERT INTO public.switch_events (switch_id, org_id, event, detail, actor)
  VALUES (
    _switch_id, _sw.org_id,
    CASE _status WHEN 'paused' THEN 'paused' WHEN 'active' THEN 'resumed' ELSE 'rolled_back' END,
    _reason, _uid
  );

  RETURN _status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_org_plan(_org_id uuid, _plan plan_tier)
 RETURNS plan_tier LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _synthetic boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_org_role(_org_id, 'owner') THEN
    RAISE EXCEPTION 'only the workspace owner can change the plan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Paid levels come from a real checkout and the signed webhook only.
  IF _plan <> 'compare' THEN
    RAISE EXCEPTION 'paid levels are set by checkout, not by request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT is_synthetic INTO _synthetic FROM public.organizations WHERE id = _org_id;
  IF _synthetic THEN
    RAISE EXCEPTION 'the demo workspace plan is fixed' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.organizations SET plan = _plan, updated_at = now() WHERE id = _org_id;
  RETURN _plan;
END;
$function$;