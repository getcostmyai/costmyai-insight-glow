CREATE TABLE public.bench_lead_events (LIKE public.lead_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE INDEX bench_lead_events_type_idx ON public.bench_lead_events (event_type, created_at DESC);
CREATE INDEX bench_lead_events_real_type_idx ON public.bench_lead_events (event_type, created_at DESC) WHERE is_synthetic = false;
GRANT ALL ON public.bench_lead_events TO service_role;
ALTER TABLE public.bench_lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read bench lead events" ON public.bench_lead_events FOR SELECT TO authenticated USING (public.is_platform_admin());