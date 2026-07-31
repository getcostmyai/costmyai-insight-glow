ALTER TABLE public.host_prices
  ADD COLUMN IF NOT EXISTS median_latency_ms integer,
  ADD COLUMN IF NOT EXISTS throughput_tps numeric,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_run_id text,
  ADD COLUMN IF NOT EXISTS is_fixture boolean NOT NULL DEFAULT false;

ALTER TABLE public.benchmarks
  ADD COLUMN IF NOT EXISTS is_fixture boolean NOT NULL DEFAULT false;

ALTER TABLE public.benchmark_margins
  ADD COLUMN IF NOT EXISTS is_fixture boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS host_prices_model_host_region_idx
  ON public.host_prices (model_key, host, region);

CREATE UNIQUE INDEX IF NOT EXISTS benchmarks_model_suite_task_idx
  ON public.benchmarks (model_key, suite, task_class);