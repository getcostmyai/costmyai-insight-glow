CREATE INDEX bench_lead_events_cover_idx ON public.bench_lead_events (event_type, created_at DESC) INCLUDE (visitor_id) WHERE is_synthetic = false;
DROP INDEX IF EXISTS public.bench_lead_events_real_type_idx;
CREATE INDEX lead_events_funnel_cover_idx ON public.lead_events (event_type, created_at DESC) INCLUDE (visitor_id) WHERE is_synthetic = false;
DROP INDEX IF EXISTS public.lead_events_real_type_idx;