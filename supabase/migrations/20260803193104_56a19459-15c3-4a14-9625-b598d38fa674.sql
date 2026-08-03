-- The scheduled writer must be able to produce real output for the synthetic
-- workspace: that ecosystem exists precisely so the four rungs can be proven
-- against realistic traffic. The read-only guarantee that matters is the human
-- one, and it stays untouched in apply_switch / set_switch_state /
-- upsert_recommendation. Everything the system writes for the demo is stamped
-- is_synthetic = true so it can never be mistaken for a customer's data.

CREATE OR REPLACE FUNCTION public.system_upsert_recommendation(
  _org_id uuid, _kind rec_kind, _min_plan plan_tier, _from_model text, _from_host text,
  _to_model text, _to_host text, _task_hint text, _monthly_saving numeric,
  _saving_pct numeric, _basis text, _note text DEFAULT NULL::text,
  _quality_delta numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _synthetic boolean;
BEGIN
  IF _to_model IS NULL OR _to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;

  _synthetic := public.org_is_synthetic(_org_id);

  SELECT id INTO _id FROM public.recommendations
  WHERE org_id = _org_id AND kind = _kind
    AND from_model = _from_model AND from_host = _from_host
    AND coalesce(task_hint, '') = coalesce(_task_hint, '')
    AND coalesce(to_model, '') = coalesce(_to_model, '')
    AND coalesce(to_host, '') = coalesce(_to_host, '')
    AND status = 'open'
  ORDER BY computed_at DESC LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.recommendations
    SET monthly_saving_usd = _monthly_saving, saving_pct = _saving_pct,
        basis = _basis, note = _note, quality_delta = _quality_delta,
        min_plan = _min_plan, computed_at = now()
    WHERE id = _id;
    RETURN _id;
  END IF;

  INSERT INTO public.recommendations (
    org_id, kind, min_plan, from_model, from_host, to_model, to_host, task_hint,
    monthly_saving_usd, saving_pct, basis, quality_delta, note, status, computed_at, is_synthetic
  ) VALUES (
    _org_id, _kind, _min_plan, _from_model, _from_host, _to_model, _to_host, _task_hint,
    _monthly_saving, _saving_pct, _basis, _quality_delta, _note, 'open', now(), _synthetic
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_apply_switch(_rec_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _rec public.recommendations%ROWTYPE; _switch_id uuid; _synthetic boolean;
BEGIN
  SELECT * INTO _rec FROM public.recommendations WHERE id = _rec_id;
  IF _rec.id IS NULL THEN
    RAISE EXCEPTION 'recommendation not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF _rec.status <> 'open' THEN
    RAISE EXCEPTION 'that recommendation is no longer open' USING ERRCODE = 'check_violation';
  END IF;
  IF _rec.to_model IS NULL OR _rec.to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.switches s
    WHERE s.org_id = _rec.org_id AND s.from_model = _rec.from_model
      AND s.from_host = _rec.from_host AND s.status = 'active'
  ) THEN
    RAISE EXCEPTION 'that workload already has an active switch' USING ERRCODE = 'unique_violation';
  END IF;

  _synthetic := public.org_is_synthetic(_rec.org_id);

  INSERT INTO public.switches (
    org_id, recommendation_id, from_model, from_host, to_model, to_host,
    basis, badge, autonomous, status, activated_by, is_synthetic
  ) VALUES (
    _rec.org_id, _rec.id, _rec.from_model, _rec.from_host, _rec.to_model, _rec.to_host,
    _rec.basis,
    CASE _rec.kind
      WHEN 'host_arbitrage' THEN 'Proven switch'
      WHEN 'rightsize'      THEN 'Right-sized'
      ELSE 'Equal-quality switch'
    END,
    true, 'active', NULL, _synthetic
  ) RETURNING id INTO _switch_id;

  UPDATE public.recommendations SET status = 'activated' WHERE id = _rec.id;

  INSERT INTO public.switch_events (switch_id, org_id, event, detail, actor, is_synthetic)
  VALUES (
    _switch_id, _rec.org_id, 'activated_autonomous',
    _rec.from_model || '@' || _rec.from_host || ' -> ' || _rec.to_model || '@' || _rec.to_host,
    NULL, _synthetic
  );

  RETURN _switch_id;
END;
$function$;