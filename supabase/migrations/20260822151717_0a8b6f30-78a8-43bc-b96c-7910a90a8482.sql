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

  -- Two evaluations can be in flight against the same workspace at the same
  -- instant (the pricing cron and the benchmark cron each chain their own
  -- run, and neither holds a lock over the other). Between the SELECT above
  -- and this INSERT, the other run can commit the same natural key. That is a
  -- collision on identical facts, not a conflict of meaning: the loser folds
  -- into an UPDATE with its own freshly computed numbers, which is precisely
  -- what it would have done had it arrived a moment later.
  INSERT INTO public.recommendations (
    org_id, kind, min_plan, from_model, from_host, to_model, to_host, task_hint,
    monthly_saving_usd, saving_pct, basis, quality_delta, note, status, computed_at, is_synthetic
  ) VALUES (
    _org_id, _kind, _min_plan, _from_model, _from_host, _to_model, _to_host, _task_hint,
    _monthly_saving, _saving_pct, _basis, _quality_delta, _note, 'open', now(), _synthetic
  )
  ON CONFLICT (org_id, kind, from_model, from_host, task_hint) DO UPDATE
  SET to_model = EXCLUDED.to_model, to_host = EXCLUDED.to_host,
      monthly_saving_usd = EXCLUDED.monthly_saving_usd, saving_pct = EXCLUDED.saving_pct,
      basis = EXCLUDED.basis, note = EXCLUDED.note, quality_delta = EXCLUDED.quality_delta,
      min_plan = EXCLUDED.min_plan, computed_at = now(),
      -- Same rule as the update path above, read off the row already there.
      status = CASE WHEN public.recommendations.status = 'activated'
                    THEN public.recommendations.status ELSE 'open'::rec_status END
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_recommendation(_org_id uuid, _kind rec_kind, _min_plan plan_tier, _from_model text, _from_host text, _to_model text, _to_host text, _task_hint text, _monthly_saving numeric, _saving_pct numeric, _basis text, _note text DEFAULT NULL::text, _quality_delta numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_org_manager(_org_id) THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.org_is_synthetic(_org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _to_model IS NULL OR _to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO _id
  FROM public.recommendations
  WHERE org_id = _org_id
    AND kind = _kind
    AND from_model = _from_model
    AND from_host = _from_host
    AND coalesce(task_hint, '') = coalesce(_task_hint, '')
    AND coalesce(to_model, '') = coalesce(_to_model, '')
    AND coalesce(to_host, '') = coalesce(_to_host, '')
    AND status = 'open'
  ORDER BY computed_at DESC
  LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.recommendations
    SET monthly_saving_usd = _monthly_saving,
        saving_pct = _saving_pct,
        basis = _basis,
        note = _note,
        quality_delta = _quality_delta,
        min_plan = _min_plan,
        computed_at = now()
    WHERE id = _id;
    RETURN _id;
  END IF;

  -- Same natural key, same collision, same resolution as the system writer.
  INSERT INTO public.recommendations (
    org_id, kind, min_plan, from_model, from_host, to_model, to_host, task_hint,
    monthly_saving_usd, saving_pct, basis, quality_delta, note, status, computed_at, is_synthetic
  ) VALUES (
    _org_id, _kind, _min_plan, _from_model, _from_host, _to_model, _to_host, _task_hint,
    _monthly_saving, _saving_pct, _basis, _quality_delta, _note, 'open', now(), false
  )
  ON CONFLICT (org_id, kind, from_model, from_host, task_hint) DO UPDATE
  SET to_model = EXCLUDED.to_model, to_host = EXCLUDED.to_host,
      monthly_saving_usd = EXCLUDED.monthly_saving_usd, saving_pct = EXCLUDED.saving_pct,
      basis = EXCLUDED.basis, note = EXCLUDED.note, quality_delta = EXCLUDED.quality_delta,
      min_plan = EXCLUDED.min_plan, computed_at = now(),
      status = CASE WHEN public.recommendations.status = 'activated'
                    THEN public.recommendations.status ELSE 'open'::rec_status END
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.system_upsert_recommendation(uuid, rec_kind, plan_tier, text, text, text, text, text, numeric, numeric, text, text, numeric) FROM sandbox_exec;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.recommendations FROM sandbox_exec;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.organizations FROM sandbox_exec;