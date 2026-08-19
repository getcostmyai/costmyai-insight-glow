-- 1. Rate limit counter cleanup ------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_limit_gc(_older_than_seconds integer DEFAULT 86400)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted integer;
BEGIN
  DELETE FROM public.rate_limit_counters
   WHERE updated_at < now() - make_interval(secs => GREATEST(60, _older_than_seconds));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_gc(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_gc(integer) TO service_role;

SELECT cron.schedule(
  'costmyai-rate-limit-gc',
  '7 * * * *',
  $$ SELECT public.rate_limit_gc(86400); $$
);

-- 2. Alert state ----------------------------------------------------------
CREATE TABLE public.job_alert_state (
  job TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,
  reason TEXT,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel TEXT,
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_alert_state TO service_role;

ALTER TABLE public.job_alert_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages job alert state"
  ON public.job_alert_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_job_alert_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_job_alert_state_updated_at
  BEFORE UPDATE ON public.job_alert_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_job_alert_state();