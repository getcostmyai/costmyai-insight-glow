-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner','admin','member');
CREATE TYPE public.plan_tier AS ENUM ('compare','certify','rightsize','govern');
CREATE TYPE public.rec_kind AS ENUM ('host_arbitrage','quality_match','rightsize');
CREATE TYPE public.rec_status AS ENUM ('open','dismissed','activated','refused');
CREATE TYPE public.switch_status AS ENUM ('active','paused','rolled_back');

-- ============ SHARED TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan public.plan_tier NOT NULL DEFAULT 'compare',
  billing_interval text NOT NULL DEFAULT 'monthly',
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_valid_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER organizations_touch BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MEMBERSHIPS + ROLES ============
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = _org_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.org_id = _org_id AND r.user_id = auth.uid() AND r.role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.org_id = _org_id AND r.user_id = auth.uid() AND r.role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.org_plan(_org_id uuid)
RETURNS public.plan_tier LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT plan FROM public.organizations WHERE id = _org_id;
$$;

CREATE POLICY "members read org" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "managers update org" ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_manager(id)) WITH CHECK (public.is_org_manager(id));
CREATE POLICY "authenticated create org" ON public.organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "members read memberships" ON public.memberships FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "managers add members" ON public.memberships FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(org_id));
CREATE POLICY "managers remove members" ON public.memberships FOR DELETE TO authenticated USING (public.is_org_manager(org_id));

CREATE POLICY "members read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- ============ API KEYS ============
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'default',
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_org_idx ON public.api_keys(org_id);
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read keys" ON public.api_keys FOR SELECT TO authenticated USING (public.is_org_manager(org_id));

-- ============ REFERENCE DATA ============
CREATE TABLE public.model_catalog (
  model_key text PRIMARY KEY,
  display_name text NOT NULL,
  vendor text NOT NULL,
  tier text NOT NULL DEFAULT 'standard',
  context_window integer,
  is_reasoning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.model_catalog TO authenticated;
GRANT ALL ON public.model_catalog TO service_role;
ALTER TABLE public.model_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read models" ON public.model_catalog FOR SELECT TO authenticated USING (true);

CREATE TABLE public.host_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL REFERENCES public.model_catalog(model_key) ON DELETE CASCADE,
  host text NOT NULL,
  host_label text NOT NULL,
  input_usd_per_mtok numeric(12,4) NOT NULL,
  output_usd_per_mtok numeric(12,4) NOT NULL,
  region text NOT NULL DEFAULT 'global',
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_key, host, region)
);
GRANT SELECT ON public.host_prices TO authenticated;
GRANT ALL ON public.host_prices TO service_role;
ALTER TABLE public.host_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read prices" ON public.host_prices FOR SELECT TO authenticated USING (true);

CREATE TABLE public.benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL REFERENCES public.model_catalog(model_key) ON DELETE CASCADE,
  suite text NOT NULL,
  task_class text NOT NULL,
  score numeric(6,3) NOT NULL,
  source text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_key, suite, task_class)
);
GRANT SELECT ON public.benchmarks TO authenticated;
GRANT ALL ON public.benchmarks TO service_role;
ALTER TABLE public.benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read benchmarks" ON public.benchmarks FOR SELECT TO authenticated USING (true);

-- ============ USAGE ============
CREATE TABLE public.usage_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  model_key text NOT NULL,
  host text NOT NULL,
  task_hint text NOT NULL DEFAULT 'generation',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'ok',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);
CREATE INDEX usage_events_org_time_idx ON public.usage_events(org_id, occurred_at DESC);
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read usage" ON public.usage_events FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.usage_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  granularity text NOT NULL DEFAULT 'hour',
  model_key text NOT NULL,
  host text NOT NULL,
  task_hint text NOT NULL DEFAULT 'generation',
  requests integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  UNIQUE (org_id, bucket_start, granularity, model_key, host, task_hint)
);
CREATE INDEX usage_rollups_org_bucket_idx ON public.usage_rollups(org_id, granularity, bucket_start DESC);
GRANT SELECT ON public.usage_rollups TO authenticated;
GRANT ALL ON public.usage_rollups TO service_role;
ALTER TABLE public.usage_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read rollups" ON public.usage_rollups FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.workload_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  host text NOT NULL,
  task_hint text NOT NULL,
  avg_input_tokens integer NOT NULL DEFAULT 0,
  avg_output_tokens integer NOT NULL DEFAULT 0,
  complexity_score numeric(5,2) NOT NULL DEFAULT 0,
  required_tier text NOT NULL DEFAULT 'standard',
  observed_tier text NOT NULL DEFAULT 'standard',
  monthly_cost_usd numeric(14,2) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, model_key, host, task_hint)
);
GRANT SELECT ON public.workload_profiles TO authenticated;
GRANT ALL ON public.workload_profiles TO service_role;
ALTER TABLE public.workload_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read workloads" ON public.workload_profiles FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- ============ RECOMMENDATIONS ============
CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.rec_kind NOT NULL,
  min_plan public.plan_tier NOT NULL DEFAULT 'compare',
  from_model text NOT NULL,
  from_host text NOT NULL,
  to_model text,
  to_host text,
  task_hint text,
  monthly_saving_usd numeric(14,2) NOT NULL DEFAULT 0,
  saving_pct numeric(5,2) NOT NULL DEFAULT 0,
  basis text NOT NULL,
  quality_delta numeric(6,3),
  note text,
  status public.rec_status NOT NULL DEFAULT 'open',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, from_model, from_host, task_hint)
);
CREATE INDEX recommendations_org_idx ON public.recommendations(org_id, status, monthly_saving_usd DESC);
GRANT SELECT, UPDATE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read recs" ON public.recommendations FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "managers update recs" ON public.recommendations FOR UPDATE TO authenticated USING (public.is_org_manager(org_id)) WITH CHECK (public.is_org_manager(org_id));

-- ============ SWITCHES ============
CREATE TABLE public.switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  from_model text NOT NULL,
  from_host text NOT NULL,
  to_model text NOT NULL,
  to_host text NOT NULL,
  basis text NOT NULL,
  badge text NOT NULL DEFAULT 'Equal-quality switch',
  autonomous boolean NOT NULL DEFAULT false,
  status public.switch_status NOT NULL DEFAULT 'active',
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid,
  saved_usd numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX switches_org_idx ON public.switches(org_id, status);
GRANT SELECT ON public.switches TO authenticated;
GRANT ALL ON public.switches TO service_role;
ALTER TABLE public.switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read switches" ON public.switches FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER switches_touch BEFORE UPDATE ON public.switches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.switch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id uuid NOT NULL REFERENCES public.switches(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX switch_events_org_idx ON public.switch_events(org_id, created_at DESC);
GRANT SELECT ON public.switch_events TO authenticated;
GRANT ALL ON public.switch_events TO service_role;
ALTER TABLE public.switch_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read switch events" ON public.switch_events FOR SELECT TO authenticated USING (public.is_org_member(org_id));