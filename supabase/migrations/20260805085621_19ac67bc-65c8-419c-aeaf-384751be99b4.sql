ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'parsed'
  CHECK (parse_status IN ('parsed', 'heuristic', 'unparsed'));

COMMENT ON COLUMN public.usage_events.parse_status IS
  'How the token counts were obtained: parsed = read from the provider''s own usage envelope; heuristic = estimated by the connector; unparsed = no counts available. Accepted at ingest since Dispatch 99 but not persisted until Dispatch 102.';