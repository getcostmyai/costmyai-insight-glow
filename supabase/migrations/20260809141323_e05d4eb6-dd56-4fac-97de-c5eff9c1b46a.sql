ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS rerouted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_model_key text,
  ADD COLUMN IF NOT EXISTS original_host text,
  ADD COLUMN IF NOT EXISTS route_reason uuid,
  ADD COLUMN IF NOT EXISTS fallback_reason text;

ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_reroute_complete;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_reroute_complete
  CHECK (NOT rerouted OR (original_model_key IS NOT NULL AND original_host IS NOT NULL));

ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_fallback_reason_valid;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_fallback_reason_valid
  CHECK (fallback_reason IS NULL OR fallback_reason IN ('connection_error','model_not_found','unsupported_parameter','destination_4xx'));

CREATE INDEX IF NOT EXISTS usage_events_reroute_idx
  ON public.usage_events (org_id, route_reason, occurred_at)
  WHERE rerouted;