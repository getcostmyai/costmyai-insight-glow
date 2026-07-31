-- 1. model_catalog: provenance + lifecycle
ALTER TABLE public.model_catalog
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS model_catalog_source_idx ON public.model_catalog (source);
CREATE INDEX IF NOT EXISTS model_catalog_active_idx ON public.model_catalog (is_active);
CREATE INDEX IF NOT EXISTS model_catalog_vendor_idx ON public.model_catalog (vendor);

-- 2. model_aliases: one model, several names. Solves the namespace collision
--    between aggregator ids (openai/gpt-4o) and our seeded bare keys.
CREATE TABLE IF NOT EXISTS public.model_aliases (
  alias text PRIMARY KEY,
  model_key text NOT NULL REFERENCES public.model_catalog(model_key) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.model_aliases TO anon, authenticated;
GRANT ALL ON public.model_aliases TO service_role;
ALTER TABLE public.model_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Model aliases are public catalogue data"
  ON public.model_aliases FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS model_aliases_model_key_idx ON public.model_aliases (model_key);

-- Every existing model is an alias of itself, so alias resolution is total.
INSERT INTO public.model_aliases (alias, model_key, source)
SELECT model_key, model_key, 'seed' FROM public.model_catalog
ON CONFLICT (alias) DO NOTHING;

-- 3. host_prices: source provenance + precedence
ALTER TABLE public.host_prices
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS source_priority smallint NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS missed_syncs smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- One row per model+host+region+source, so an aggregated price and a
-- provider-direct price for the same endpoint can coexist and be ranked.
DROP INDEX IF EXISTS public.host_prices_model_host_region_idx;
ALTER TABLE public.host_prices
  DROP CONSTRAINT IF EXISTS host_prices_model_key_host_region_key;
CREATE UNIQUE INDEX IF NOT EXISTS host_prices_model_host_region_source_idx
  ON public.host_prices (model_key, host, region, price_source);

CREATE INDEX IF NOT EXISTS host_prices_active_idx ON public.host_prices (is_active, is_fixture);
CREATE INDEX IF NOT EXISTS host_prices_model_key_idx ON public.host_prices (model_key);

-- 4. price_history: a row ONLY when a price genuinely moved.
CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL,
  host text NOT NULL,
  region text NOT NULL DEFAULT 'global',
  price_source text NOT NULL,
  change_kind text NOT NULL CHECK (change_kind IN ('new', 'increase', 'decrease', 'delisted', 'relisted')),
  input_usd_per_mtok numeric,
  output_usd_per_mtok numeric,
  prev_input_usd_per_mtok numeric,
  prev_output_usd_per_mtok numeric,
  pct_change numeric,
  sync_run_id text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_history TO anon, authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price history is public catalogue data"
  ON public.price_history FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS price_history_observed_idx ON public.price_history (observed_at DESC);
CREATE INDEX IF NOT EXISTS price_history_change_kind_idx ON public.price_history (change_kind, observed_at DESC);
CREATE INDEX IF NOT EXISTS price_history_model_idx ON public.price_history (model_key, host, observed_at DESC);

-- 5. current_prices: the winning row per (model, host, region).
--    Lowest source_priority wins: provider-direct (10) beats aggregated (50)
--    beats the original seed (90). This is what the engine reads.
CREATE OR REPLACE VIEW public.current_prices
WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.model_key, p.host, p.region)
  p.id, p.model_key, p.host, p.host_label, p.region,
  p.input_usd_per_mtok, p.output_usd_per_mtok,
  p.price_source, p.source_priority, p.external_id,
  p.verified_at, p.last_seen_at, p.is_fixture,
  p.median_ttft_ms, p.output_tps, p.median_latency_ms, p.throughput_tps,
  p.latency_scope, p.latency_measured_at
FROM public.host_prices p
WHERE p.is_active = true
ORDER BY p.model_key, p.host, p.region, p.source_priority ASC, p.verified_at DESC;

GRANT SELECT ON public.current_prices TO anon, authenticated, service_role;

-- 6. pricing_snapshots: allow an in-progress marker so a 3-minute cron can
--    never overlap itself.
ALTER TABLE public.pricing_snapshots
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS models_upserted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_changes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE INDEX IF NOT EXISTS pricing_snapshots_feed_idx
  ON public.pricing_snapshots (feed, synced_at DESC);