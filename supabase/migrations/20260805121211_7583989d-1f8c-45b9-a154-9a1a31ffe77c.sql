ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS envelope_skeleton jsonb,
  ADD COLUMN IF NOT EXISTS reparsed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS parser_revision smallint;

COMMENT ON COLUMN public.usage_events.envelope_skeleton IS
  'Dispatch 106. Content-free structural skeleton of a response envelope the connector could not parse cleanly: object keys and numeric values only, every string value erased at the source and re-validated at the ingest edge. Never populated for parse_status = parsed. Exists solely so a parser shipped later can retroactively re-read the event.';

COMMENT ON COLUMN public.usage_events.reparsed_at IS
  'When this event was last retroactively re-read by a newer parser revision.';

COMMENT ON COLUMN public.usage_events.parser_revision IS
  'Parser revision that produced the current token counts, when they came from a retroactive re-read.';

-- Only the degraded events carry a skeleton, so the partial index that drives
-- the reprocessing sweep stays small no matter how large usage_events grows.
CREATE INDEX IF NOT EXISTS usage_events_reprocessable_idx
  ON public.usage_events (org_id, occurred_at)
  WHERE parse_status <> 'parsed' AND envelope_skeleton IS NOT NULL;