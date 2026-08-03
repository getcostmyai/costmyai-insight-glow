CREATE OR REPLACE FUNCTION public.system_upsert_recommendation(_org_id uuid, _kind rec_kind, _min_plan plan_tier, _from_model text, _from_host text, _to_model text, _to_host text, _task_hint text, _monthly_saving numeric, _saving_pct numeric, _basis text, _note text DEFAULT NULL::text, _quality_delta numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _status rec_status; _synthetic boolean;
BEGIN
  IF _to_model IS NULL OR _to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;

  _synthetic := public.org_is_synthetic(_org_id);

  -- One row per workload and kind, exactly as the unique key models it. A row
  -- that a previous cycle retired is revived here rather than fought with.
  SELECT id, status INTO _id, _status
  FROM public.recommendations
  WHERE org_id = _org_id AND kind = _kind
    AND from_model = _from_model AND from_host = _from_host
    AND coalesce(task_hint, '') = coalesce(_task_hint, '')
  LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.recommendations
    SET to_model = _to_model, to_host = _to_host,
        monthly_saving_usd = _monthly_saving, saving_pct = _saving_pct,
        basis = _basis, note = _note, quality_delta = _quality_delta,
        min_plan = _min_plan, computed_at = now(),
        -- An activated recommendation stays activated: a live switch is not
        -- reopened underneath the customer.
        status = CASE WHEN _status = 'activated' THEN _status ELSE 'open'::rec_status END
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