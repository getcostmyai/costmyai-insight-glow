CREATE OR REPLACE FUNCTION public.apply_switch(
  _rec_id uuid,
  _autonomous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.recommendations%ROWTYPE;
  _switch_id uuid;
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
$$;

REVOKE ALL ON FUNCTION public.apply_switch(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_switch(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_switch_state(
  _switch_id uuid,
  _status public.switch_status,
  _reason text DEFAULT NULL
)
RETURNS public.switch_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.set_switch_state(uuid, public.switch_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_switch_state(uuid, public.switch_status, text) TO authenticated;