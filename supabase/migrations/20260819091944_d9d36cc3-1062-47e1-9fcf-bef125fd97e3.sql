-- 1. Clean message when the unique constraint, not the pre-check, catches the race.
CREATE OR REPLACE FUNCTION public.apply_switch(_rec_id uuid, _autonomous boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- The pre-check above cannot see a concurrent uncommitted insert. When the
  -- unique index catches that race instead, the loser must read the same
  -- sentence as the pre-check, never raw Postgres constraint text.
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'that workload already has an active switch' USING ERRCODE = 'unique_violation';
  END;

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

-- 2. Single-flight locks for scheduled jobs.
CREATE TABLE IF NOT EXISTS public.job_locks (
  job text PRIMARY KEY,
  token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_locks TO service_role;
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages job locks"
  ON public.job_locks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.job_lock_acquire(_job text, _ttl_seconds integer DEFAULT 900)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token uuid := gen_random_uuid();
  _got uuid;
BEGIN
  INSERT INTO public.job_locks AS l (job, token, acquired_at, expires_at, updated_at)
  VALUES (_job, _token, now(), now() + make_interval(secs => greatest(_ttl_seconds, 1)), now())
  ON CONFLICT (job) DO UPDATE
    SET token = excluded.token,
        acquired_at = now(),
        expires_at = excluded.expires_at,
        updated_at = now()
    WHERE l.expires_at <= now()
  RETURNING l.token INTO _got;

  IF _got IS DISTINCT FROM _token THEN
    RETURN NULL; -- someone else holds a live lock
  END IF;
  RETURN _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.job_lock_release(_job text, _token uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH d AS (
    DELETE FROM public.job_locks WHERE job = _job AND token = _token RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM d);
$$;

REVOKE ALL ON FUNCTION public.job_lock_acquire(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_lock_release(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_lock_acquire(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_lock_release(text, uuid) TO service_role;