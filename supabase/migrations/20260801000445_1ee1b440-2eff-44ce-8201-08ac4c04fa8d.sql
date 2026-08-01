CREATE TABLE public.job_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_config TO service_role;

ALTER TABLE public.job_config ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy: this table holds a credential the scheduler reads as
-- a superuser. No signed-in role, admin included, has any path to it.

CREATE TRIGGER job_config_touch
  BEFORE UPDATE ON public.job_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT USAGE ON SCHEMA cron TO postgres;