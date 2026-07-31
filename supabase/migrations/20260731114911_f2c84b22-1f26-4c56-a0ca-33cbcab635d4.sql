-- ============================================================
-- Phase 1: benchmark provenance, pricing freshness, billing
-- reconciliation, routing rules, entitlements, objectives,
-- synthetic isolation.
-- ZERO-CREDENTIALS INVARIANT: no table below stores a provider
-- API key, token, or secret of any kind.
-- ============================================================

-- ---------- enums ----------
CREATE TYPE public.objective_kind AS ENUM ('cost', 'latency', 'quality_floor');
CREATE TYPE public.routing_source AS ENUM ('manual', 'autonomous');
CREATE TYPE public.routing_state AS ENUM ('active', 'paused', 'rolled_back');

-- ---------- benchmark provenance ----------
ALTER TABLE public.benchmarks
  ADD COLUMN IF NOT EXISTS source_run_id text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sample_size integer;

-- Per-suite/task measurement margin: the real Clause 04 equivalence boundary.
CREATE TABLE public.benchmark_margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite text NOT NULL,
  task_class text NOT NULL,
  margin numeric NOT NULL,
  method text NOT NULL DEFAULT 'reported_stderr_2sigma',
  source_run_id text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suite, task_class)
);
GRANT SELECT ON public.benchmark_margins TO anon;
GRANT SELECT ON public.benchmark_margins TO authenticated;
GRANT ALL ON public.benchmark_margins TO service_role;
ALTER TABLE public.benchmark_margins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read benchmark margins" ON public.benchmark_margins FOR SELECT TO anon USING (true);
CREATE POLICY "read benchmark margins" ON public.benchmark_margins FOR SELECT TO authenticated USING (true);
CREATE TRIGGER touch_benchmark_margins BEFORE UPDATE ON public.benchmark_margins
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- pricing / benchmark sync snapshots ----------
CREATE TABLE public.pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  rows_upserted integer NOT NULL DEFAULT 0,
  error_detail text,
  is_fixture boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pricing_snapshots_feed_synced_idx ON public.pricing_snapshots (feed, synced_at DESC);
GRANT SELECT ON public.pricing_snapshots TO anon;
GRANT SELECT ON public.pricing_snapshots TO authenticated;
GRANT ALL ON public.pricing_snapshots TO service_role;
ALTER TABLE public.pricing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read pricing snapshots" ON public.pricing_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "read pricing snapshots" ON public.pricing_snapshots FOR SELECT TO authenticated USING (true);

-- ---------- customer-pushed billing (no credentials, ever) ----------
CREATE TABLE public.billing_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  invoiced_usd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  idempotency_key text,
  is_synthetic boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, period_start, period_end)
);
CREATE INDEX billing_captures_org_idx ON public.billing_captures (org_id, period_start DESC);
GRANT SELECT ON public.billing_captures TO authenticated;
GRANT ALL ON public.billing_captures TO service_role;
ALTER TABLE public.billing_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read billing captures" ON public.billing_captures
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.billing_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES public.billing_captures(id) ON DELETE CASCADE,
  estimated_usd numeric NOT NULL,
  invoiced_usd numeric NOT NULL,
  delta_usd numeric NOT NULL,
  delta_pct numeric NOT NULL,
  verdict text NOT NULL DEFAULT 'within_tolerance',
  note text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_reconciliations_org_idx ON public.billing_reconciliations (org_id, computed_at DESC);
GRANT SELECT ON public.billing_reconciliations TO authenticated;
GRANT ALL ON public.billing_reconciliations TO service_role;
ALTER TABLE public.billing_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read billing reconciliations" ON public.billing_reconciliations
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- ---------- routing rules (read by the customer-side engine) ----------
-- INVARIANT: no credential column. The engine resolves execution keys locally.
CREATE TABLE public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  switch_id uuid REFERENCES public.switches(id) ON DELETE SET NULL,
  from_model text NOT NULL,
  from_host text NOT NULL,
  task_hint text,
  to_model text NOT NULL,
  to_host text NOT NULL,
  source public.routing_source NOT NULL DEFAULT 'manual',
  state public.routing_state NOT NULL DEFAULT 'active',
  basis text NOT NULL DEFAULT 'host_arbitrage',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX routing_rules_active_match_idx
  ON public.routing_rules (org_id, from_model, from_host, COALESCE(task_hint, '*'))
  WHERE state = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read routing rules" ON public.routing_rules
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "managers write routing rules" ON public.routing_rules
  FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(org_id));
CREATE POLICY "managers update routing rules" ON public.routing_rules
  FOR UPDATE TO authenticated USING (public.is_org_manager(org_id)) WITH CHECK (public.is_org_manager(org_id));
CREATE POLICY "managers delete routing rules" ON public.routing_rules
  FOR DELETE TO authenticated USING (public.is_org_manager(org_id));
CREATE TRIGGER touch_routing_rules BEFORE UPDATE ON public.routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- plan entitlements (single source of gating truth) ----------
CREATE TABLE public.plan_entitlements (
  plan public.plan_tier PRIMARY KEY,
  host_arbitrage boolean NOT NULL DEFAULT true,
  quality_match boolean NOT NULL DEFAULT false,
  rightsize boolean NOT NULL DEFAULT false,
  manual_switching boolean NOT NULL DEFAULT false,
  autonomous_switching boolean NOT NULL DEFAULT false,
  objective_selection boolean NOT NULL DEFAULT false,
  billing_reconciliation boolean NOT NULL DEFAULT false,
  max_seats integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_entitlements TO anon;
GRANT SELECT ON public.plan_entitlements TO authenticated;
GRANT ALL ON public.plan_entitlements TO service_role;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read entitlements" ON public.plan_entitlements FOR SELECT TO anon USING (true);
CREATE POLICY "read entitlements" ON public.plan_entitlements FOR SELECT TO authenticated USING (true);
CREATE TRIGGER touch_plan_entitlements BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.plan_entitlements
  (plan, host_arbitrage, quality_match, rightsize, manual_switching, autonomous_switching, objective_selection, billing_reconciliation, max_seats)
VALUES
  ('compare',   true, false, false, false, false, false, false, 3),
  ('certify',   true, true,  false, false, false, true,  true,  10),
  ('rightsize', true, true,  true,  true,  false, true,  true,  25),
  ('govern',    true, true,  true,  true,  true,  true,  true,  NULL);

-- ---------- objectives (Clause 07) ----------
CREATE TABLE public.objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL workload columns == account-wide default; non-null == per-workload override
  model_key text,
  host text,
  task_hint text,
  objective public.objective_kind NOT NULL DEFAULT 'cost',
  quality_floor_score numeric,
  max_latency_ms integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX objectives_scope_idx ON public.objectives
  (org_id, COALESCE(model_key, '*'), COALESCE(host, '*'), COALESCE(task_hint, '*'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objectives TO authenticated;
GRANT ALL ON public.objectives TO service_role;
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read objectives" ON public.objectives
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "managers insert objectives" ON public.objectives
  FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(org_id));
CREATE POLICY "managers update objectives" ON public.objectives
  FOR UPDATE TO authenticated USING (public.is_org_manager(org_id)) WITH CHECK (public.is_org_manager(org_id));
CREATE POLICY "managers delete objectives" ON public.objectives
  FOR DELETE TO authenticated USING (public.is_org_manager(org_id));
CREATE TRIGGER touch_objectives BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- synthetic isolation on every tenant-scoped table ----------
ALTER TABLE public.organizations     ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.usage_events      ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.usage_rollups     ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.workload_profiles ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.recommendations   ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.switches          ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.switch_events     ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.routing_rules     ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE public.objectives        ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

-- The demo tenant is synthetic by definition.
UPDATE public.organizations SET is_synthetic = true WHERE id = '00000000-0000-0000-0000-000000000001';

-- Write-side guard: rows belonging to a synthetic org must be flagged synthetic.
CREATE OR REPLACE FUNCTION public.enforce_synthetic_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE org_synth boolean;
BEGIN
  SELECT is_synthetic INTO org_synth FROM public.organizations WHERE id = NEW.org_id;
  IF org_synth IS NOT NULL THEN
    NEW.is_synthetic = org_synth;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER sync_synthetic_usage_events BEFORE INSERT OR UPDATE ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_usage_rollups BEFORE INSERT OR UPDATE ON public.usage_rollups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_workload_profiles BEFORE INSERT OR UPDATE ON public.workload_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_recommendations BEFORE INSERT OR UPDATE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_switches BEFORE INSERT OR UPDATE ON public.switches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_routing_rules BEFORE INSERT OR UPDATE ON public.routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_billing_captures BEFORE INSERT OR UPDATE ON public.billing_captures
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();
CREATE TRIGGER sync_synthetic_objectives BEFORE INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag();

-- ---------- public demo read access for the new tenant tables ----------
GRANT SELECT ON public.routing_rules TO anon;
CREATE POLICY "public read demo routing rules" ON public.routing_rules
  FOR SELECT TO anon USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);
GRANT SELECT ON public.objectives TO anon;
CREATE POLICY "public read demo objectives" ON public.objectives
  FOR SELECT TO anon USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid);