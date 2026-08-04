ALTER TABLE public.sync_runs
  ADD COLUMN IF NOT EXISTS rows_written integer,
  ADD COLUMN IF NOT EXISTS outcome text;

UPDATE public.sync_runs
   SET outcome = CASE WHEN ok THEN 'ok' ELSE 'failed' END
 WHERE outcome IS NULL;

ALTER TABLE public.sync_runs
  ADD CONSTRAINT sync_runs_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('ok','empty','quiet','failed'));

CREATE INDEX IF NOT EXISTS sync_runs_job_started_idx
  ON public.sync_runs (job, started_at DESC);