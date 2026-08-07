CREATE TABLE public.task_drift_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id text NOT NULL,
  task_id text NOT NULL,
  task_revision smallint NOT NULL,
  prompt_sha256 text NOT NULL,
  model_key text NOT NULL,
  vendor text NOT NULL,
  ok boolean NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  upstream_cost_usd numeric,
  latency_ms integer,
  response_sha256 text,
  error text,
  is_fixture boolean NOT NULL DEFAULT false,
  observed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.task_drift_observations TO service_role;

ALTER TABLE public.task_drift_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task drift readable by platform admins"
  ON public.task_drift_observations FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE INDEX task_drift_task_model_time_idx
  ON public.task_drift_observations (task_id, model_key, observed_at DESC);

CREATE INDEX task_drift_run_idx
  ON public.task_drift_observations (run_id);

CREATE UNIQUE INDEX task_drift_run_task_model_uidx
  ON public.task_drift_observations (run_id, task_id, model_key);

CREATE OR REPLACE FUNCTION public.task_drift_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'task_drift_observations is append-only';
END;
$$;

CREATE TRIGGER task_drift_no_update
  BEFORE UPDATE OR DELETE ON public.task_drift_observations
  FOR EACH ROW EXECUTE FUNCTION public.task_drift_append_only();