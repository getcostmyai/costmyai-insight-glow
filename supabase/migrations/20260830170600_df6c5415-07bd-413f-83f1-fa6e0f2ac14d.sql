CREATE TYPE public.refusal_class AS ENUM ('measured', 'unmeasurable', 'no_candidate');

CREATE TYPE public.refusal_reason AS ENUM (
  'no_baseline_price',
  'no_baseline_score',
  'no_valid_instrument',
  'task_label_low_confidence',
  'benchmark_data_stale',
  'benchmark_not_discriminating',
  'no_candidate_clears_bar',
  'no_cheaper_candidate',
  'latency_ceiling_unmet',
  'saving_below_floor',
  'no_model_tier',
  'insufficient_sample',
  'already_right_sized',
  'no_target_tier_priced'
);

CREATE TABLE public.refusal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_synthetic boolean NOT NULL DEFAULT false,
  kind public.rec_kind NOT NULL,
  from_model text NOT NULL,
  from_host text NOT NULL,
  task_hint text,
  reason public.refusal_reason NOT NULL,
  refusal_class public.refusal_class NOT NULL,
  detail text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refusal_events_org_reason_idx ON public.refusal_events (org_id, reason, computed_at DESC);
CREATE INDEX refusal_events_org_computed_idx ON public.refusal_events (org_id, computed_at DESC);
CREATE INDEX refusal_events_org_kind_idx ON public.refusal_events (org_id, kind, computed_at DESC);

GRANT SELECT ON public.refusal_events TO authenticated;
GRANT ALL ON public.refusal_events TO service_role;
ALTER TABLE public.refusal_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sync_synthetic_refusal_events BEFORE INSERT OR UPDATE ON public.refusal_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();

CREATE POLICY "members read refusal events" ON public.refusal_events FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));