CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------- run log --
CREATE TABLE public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean,
  detail jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_runs_job_started_idx ON public.sync_runs (job, started_at DESC);

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read sync runs"
  ON public.sync_runs FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE TRIGGER sync_runs_touch
  BEFORE UPDATE ON public.sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------- writer: recommendation upsert --
-- Same body as upsert_recommendation, minus the auth.uid() requirement, because
-- the scheduler is not a person. Locked to service_role so the absence of that
-- check can never be reached from the Data API.
CREATE OR REPLACE FUNCTION public.system_upsert_recommendation(
  _org_id uuid, _kind rec_kind, _min_plan plan_tier,
  _from_model text, _from_host text, _to_model text, _to_host text,
  _task_hint text, _monthly_saving numeric, _saving_pct numeric,
  _basis text, _note text DEFAULT NULL, _quality_delta numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _id uuid;
BEGIN
  IF public.org_is_synthetic(_org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _to_model IS NULL OR _to_host IS NULL THEN
    RAISE EXCEPTION 'that recommendation has no destination' USING ERRCODE = 'check_violation';
  END IF;

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
    _monthly_saving, _saving_pct, _basis, _quality_delta, _note, 'open', now(), false
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.system_upsert_recommendation(uuid, rec_kind, plan_tier, text, text, text, text, text, numeric, numeric, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_upsert_recommendation(uuid, rec_kind, plan_tier, text, text, text, text, text, numeric, numeric, text, text, numeric) TO service_role;

-- --------------------------------------------- writer: autonomous activate --
CREATE OR REPLACE FUNCTION public.system_apply_switch(_rec_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _rec public.recommendations%ROWTYPE; _switch_id uuid;
BEGIN
  SELECT * INTO _rec FROM public.recommendations WHERE id = _rec_id;
  IF _rec.id IS NULL THEN
    RAISE EXCEPTION 'recommendation not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.org_is_synthetic(_rec.org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
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

  INSERT INTO public.switches (
    org_id, recommendation_id, from_model, from_host, to_model, to_host,
    basis, badge, autonomous, status, activated_by
  ) VALUES (
    _rec.org_id, _rec.id, _rec.from_model, _rec.from_host, _rec.to_model, _rec.to_host,
    _rec.basis,
    CASE _rec.kind
      WHEN 'host_arbitrage' THEN 'Proven switch'
      WHEN 'rightsize'      THEN 'Right-sized'
      ELSE 'Equal-quality switch'
    END,
    true, 'active', NULL
  ) RETURNING id INTO _switch_id;

  UPDATE public.recommendations SET status = 'activated' WHERE id = _rec.id;

  INSERT INTO public.switch_events (switch_id, org_id, event, detail, actor)
  VALUES (
    _switch_id, _rec.org_id, 'activated_autonomous',
    _rec.from_model || '@' || _rec.from_host || ' -> ' || _rec.to_model || '@' || _rec.to_host,
    NULL
  );

  RETURN _switch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.system_apply_switch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_apply_switch(uuid) TO service_role;