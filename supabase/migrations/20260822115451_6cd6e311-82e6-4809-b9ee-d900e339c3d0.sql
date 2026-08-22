ALTER TABLE public.lead_events ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS lead_events_session_id_idx ON public.lead_events (session_id, created_at);