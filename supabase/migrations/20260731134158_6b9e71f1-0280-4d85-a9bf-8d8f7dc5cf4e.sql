-- Latency inputs from the Artificial Analysis feed.
-- AA publishes latency per MODEL (a median across the hosts it measures), not
-- per host/endpoint. Writing that number into a host row without saying so
-- would claim a host-level measurement we do not have, so the scope travels
-- with the value and the engine states it in every recommendation and refusal.
ALTER TABLE public.host_prices
  ADD COLUMN IF NOT EXISTS median_ttft_ms integer,
  ADD COLUMN IF NOT EXISTS output_tps numeric,
  ADD COLUMN IF NOT EXISTS latency_scope text,
  ADD COLUMN IF NOT EXISTS latency_source_run_id text,
  ADD COLUMN IF NOT EXISTS latency_measured_at timestamptz;

ALTER TABLE public.host_prices
  DROP CONSTRAINT IF EXISTS host_prices_latency_scope_check;

ALTER TABLE public.host_prices
  ADD CONSTRAINT host_prices_latency_scope_check
  CHECK (latency_scope IS NULL OR latency_scope IN ('model', 'host'));

COMMENT ON COLUMN public.host_prices.median_ttft_ms IS
  'Median time to first token, milliseconds. Scope given by latency_scope.';
COMMENT ON COLUMN public.host_prices.output_tps IS
  'Median output tokens per second. Combined with median_ttft_ms and a workload''s own output length to derive expected end-to-end latency.';
COMMENT ON COLUMN public.host_prices.latency_scope IS
  'model = feed publishes one median across hosts for this model; host = genuinely measured on this host/endpoint. Never guess.';