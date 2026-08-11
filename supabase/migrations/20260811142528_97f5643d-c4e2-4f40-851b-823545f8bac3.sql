-- Dispatch 204, Part A + B: cache-aware metering and pricing.
-- Every column is additive with a safe default, so existing rows stay valid
-- and every previously computed figure is reproducible unchanged.

-- Part A: captured counters. Both are SUBSETS of input_tokens: a cached read
-- is an input token that was billed at the cache rate rather than the base
-- rate, not an extra token. The parsers normalise every provider convention
-- to that one invariant so the arithmetic downstream is provider-independent.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS cache_read_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_cache_within_input
  CHECK (cache_read_tokens >= 0
     AND cache_write_tokens >= 0
     AND cache_read_tokens + cache_write_tokens <= input_tokens);

-- Rollups carry the same two sums, because a rollup's cost_usd is re-derived
-- from its own tokens. Without them the day bucket could not reprice what the
-- events underneath it recorded.
ALTER TABLE public.usage_rollups
  ADD COLUMN IF NOT EXISTS cache_read_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens bigint NOT NULL DEFAULT 0;

-- Part B: published cache rates, per model per host. NULL means the feed
-- published no cache rate for this endpoint, which the cost function reads as
-- "bill it at the base input rate" — identical to today's behaviour.
ALTER TABLE public.host_prices
  ADD COLUMN IF NOT EXISTS cache_read_usd_per_mtok numeric,
  ADD COLUMN IF NOT EXISTS cache_write_usd_per_mtok numeric,
  ADD COLUMN IF NOT EXISTS supports_prompt_caching boolean NOT NULL DEFAULT false;

ALTER TABLE public.host_prices
  ADD CONSTRAINT host_prices_cache_rates_nonnegative
  CHECK ((cache_read_usd_per_mtok IS NULL OR cache_read_usd_per_mtok >= 0)
     AND (cache_write_usd_per_mtok IS NULL OR cache_write_usd_per_mtok >= 0));

COMMENT ON COLUMN public.usage_events.cache_read_tokens IS
  'Input tokens served from the provider prompt cache. Subset of input_tokens.';
COMMENT ON COLUMN public.usage_events.cache_write_tokens IS
  'Input tokens written into the provider prompt cache. Subset of input_tokens.';
COMMENT ON COLUMN public.host_prices.supports_prompt_caching IS
  'True only when the feed published a cache-read rate for this endpoint.';