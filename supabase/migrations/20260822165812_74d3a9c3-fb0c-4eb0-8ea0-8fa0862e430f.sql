REVOKE ALL ON FUNCTION public.lead_events_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_drift_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.benchmark_eligible_companies() FROM anon;