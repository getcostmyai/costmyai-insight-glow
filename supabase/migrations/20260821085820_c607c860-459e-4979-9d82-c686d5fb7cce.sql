SET lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS usage_events_route_reason_idx
  ON public.usage_events (route_reason)
  WHERE route_reason IS NOT NULL;