ALTER TABLE public.usage_rollups
  ADD COLUMN IF NOT EXISTS output_p50 integer,
  ADD COLUMN IF NOT EXISTS output_p95 integer;

COMMENT ON COLUMN public.usage_rollups.output_p50 IS 'Median output tokens per request in this bucket. Observed shape only, never content.';
COMMENT ON COLUMN public.usage_rollups.output_p95 IS '95th percentile output tokens per request in this bucket. Drives rightsize dispersion.';