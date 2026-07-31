DROP VIEW IF EXISTS public.current_prices;

ALTER TABLE public.host_prices
  ALTER COLUMN input_usd_per_mtok TYPE numeric(14,6),
  ALTER COLUMN output_usd_per_mtok TYPE numeric(14,6);

ALTER TABLE public.price_history
  ALTER COLUMN input_usd_per_mtok TYPE numeric(14,6),
  ALTER COLUMN output_usd_per_mtok TYPE numeric(14,6),
  ALTER COLUMN prev_input_usd_per_mtok TYPE numeric(14,6),
  ALTER COLUMN prev_output_usd_per_mtok TYPE numeric(14,6);

CREATE VIEW public.current_prices
WITH (security_invoker = true) AS
  SELECT DISTINCT ON (model_key, host, region)
    id, model_key, host, host_label, region,
    input_usd_per_mtok, output_usd_per_mtok,
    price_source, source_priority, external_id,
    verified_at, last_seen_at, is_fixture,
    median_ttft_ms, output_tps, median_latency_ms, throughput_tps,
    latency_scope, latency_measured_at
  FROM public.host_prices p
  WHERE is_active = true
  ORDER BY model_key, host, region, source_priority, verified_at DESC;

GRANT SELECT ON public.current_prices TO anon, authenticated;
GRANT ALL ON public.current_prices TO service_role;

ALTER TABLE public.model_catalog
  ADD COLUMN IF NOT EXISTS endpoints_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS model_catalog_endpoints_synced_at_idx
  ON public.model_catalog (endpoints_synced_at NULLS FIRST);