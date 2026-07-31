CREATE OR REPLACE FUNCTION public.upsert_recommendation(
  _org_id uuid,
  _kind rec_kind,
  _min_plan plan_tier,
  _from_model text,
  _from_host text,
  _to_model text,
  _to_host text,
  _task_hint text,
  _monthly_saving numeric,
  _saving_pct numeric,
  _basis text,
  _note text DEFAULT NULL,
  _quality_delta numeric DEFAULT NULL
)
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

  INSERT INTO public.recommendations (
    org_id, kind, min_plan, from_model, from_host, to_model, to_host, task_hint,
    monthly_saving_usd, saving_pct, basis, quality_delta, note, status, computed_at, is_synthetic
  ) VALUES (
    _org_id, _kind, _min_plan, _from_model, _from_host, _to_model, _to_host, _task_hint,
    _monthly_saving, _saving_pct, _basis, _quality_delta, _note, 'open', now(), false
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_recommendation(uuid, rec_kind, plan_tier, text, text, text, text, text, numeric, numeric, text, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_recommendation(uuid, rec_kind, plan_tier, text, text, text, text, text, numeric, numeric, text, text, numeric) TO authenticated, service_role;