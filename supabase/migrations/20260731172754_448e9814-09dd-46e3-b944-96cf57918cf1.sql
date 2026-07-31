-- ============================================================
-- Phase 7 — partner / affiliate program
-- ============================================================

CREATE TYPE public.partner_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE public.partner_role AS ENUM ('owner', 'member');
CREATE TYPE public.commission_status AS ENUM ('pending', 'approved', 'paid', 'clawed_back');

-- ---------- tiers ----------
CREATE TABLE public.partner_tiers (
  tier smallint PRIMARY KEY,
  name text NOT NULL,
  min_lifetime_referred_usd numeric NOT NULL,
  rate_pct numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_tiers TO authenticated, anon;
GRANT ALL ON public.partner_tiers TO service_role;
ALTER TABLE public.partner_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiers are public" ON public.partner_tiers FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.partner_tiers (tier, name, min_lifetime_referred_usd, rate_pct) VALUES
  (0, 'Starter',  0,      15),
  (1, 'Bronze',   5000,   20),
  (2, 'Silver',   10000,  25),
  (3, 'Gold',     40000,  30),
  (4, 'Platinum', 130000, 35);

-- ---------- platform admins ----------
-- Deliberately tiny and not self-service: rows are added out of band. Nobody
-- reads this table from the app except the security-definer check below.
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid());
$$;

-- ---------- partners ----------
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  contact_email text,
  status public.partner_status NOT NULL DEFAULT 'pending',
  -- NULL means "whatever the ledger has earned". A value here is an override
  -- and always has a matching audit row.
  tier_override smallint REFERENCES public.partner_tiers(tier),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.partner_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);
GRANT SELECT ON public.partner_users TO authenticated;
GRANT ALL ON public.partner_users TO service_role;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;

-- Membership checks are security definer so the partner policies can use them
-- without reading partner_users through its own policy.
CREATE OR REPLACE FUNCTION public.is_partner_member(_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_users pu
    WHERE pu.partner_id = _partner_id AND pu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner_owner(_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_users pu
    WHERE pu.partner_id = _partner_id AND pu.user_id = auth.uid() AND pu.role = 'owner'
  );
$$;

CREATE POLICY "members read their partner" ON public.partners
  FOR SELECT TO authenticated
  USING (public.is_partner_member(id) OR public.is_platform_admin());

-- Owners may edit the presentation of their partner account. The columns that
-- decide money — referral_code, status, tier_override — are locked by the
-- trigger below, not by trust.
CREATE POLICY "owners edit their partner" ON public.partners
  FOR UPDATE TO authenticated
  USING (public.is_partner_owner(id))
  WITH CHECK (public.is_partner_owner(id));

CREATE OR REPLACE FUNCTION public.protect_partner_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.tier_override IS DISTINCT FROM OLD.tier_override THEN
    RAISE EXCEPTION 'referral code, status and tier are set by CostMyAI, not by the partner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER partners_protect BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.protect_partner_columns();

CREATE POLICY "members read their teammates" ON public.partner_users
  FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id) OR public.is_platform_admin());

-- ---------- referral attribution ----------
ALTER TABLE public.organizations
  ADD COLUMN referred_by_partner_id uuid REFERENCES public.partners(id),
  ADD COLUMN referred_at timestamptz;

-- Lifetime attribution: once a workspace belongs to a partner it stays there.
CREATE OR REPLACE FUNCTION public.freeze_referral()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.referred_by_partner_id IS NOT NULL
     AND NEW.referred_by_partner_id IS DISTINCT FROM OLD.referred_by_partner_id THEN
    RAISE EXCEPTION 'referral attribution is for the lifetime of the workspace'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_freeze_referral BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.freeze_referral();

CREATE OR REPLACE FUNCTION public.attach_referral(_org_id uuid, _code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _partner public.partners%ROWTYPE;
  _existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_org_role(_org_id, 'owner') THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.org_is_synthetic(_org_id) THEN
    RAISE EXCEPTION 'the demo workspace is read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT referred_by_partner_id INTO _existing FROM public.organizations WHERE id = _org_id;
  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'this workspace already has a referral' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _partner FROM public.partners
  WHERE lower(referral_code) = lower(btrim(coalesce(_code, ''))) AND status = 'active';
  IF _partner.id IS NULL THEN
    RAISE EXCEPTION 'that referral code is not valid' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.organizations
  SET referred_by_partner_id = _partner.id, referred_at = now(), updated_at = now()
  WHERE id = _org_id;

  RETURN _partner.id;
END;
$$;

-- ---------- commission ledger ----------
CREATE TABLE public.commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id text NOT NULL,
  stripe_subscription_id text,
  period_start timestamptz,
  period_end timestamptz,
  revenue_usd numeric NOT NULL,
  rate_pct numeric NOT NULL,
  commission_usd numeric NOT NULL,
  status public.commission_status NOT NULL DEFAULT 'pending',
  environment text NOT NULL DEFAULT 'live',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- An invoice pays a partner exactly once, however many times the provider
  -- retries the webhook.
  UNIQUE (partner_id, invoice_id)
);
CREATE INDEX commission_ledger_partner_idx ON public.commission_ledger (partner_id, created_at DESC);
GRANT SELECT ON public.commission_ledger TO authenticated;
GRANT ALL ON public.commission_ledger TO service_role;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners read their own ledger" ON public.commission_ledger
  FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id) OR public.is_platform_admin());

-- ---------- tier resolution ----------
CREATE OR REPLACE FUNCTION public.partner_lifetime_revenue(_partner_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(revenue_usd), 0)
  FROM public.commission_ledger
  WHERE partner_id = _partner_id AND status <> 'clawed_back';
$$;

CREATE OR REPLACE FUNCTION public.partner_earned_tier(_partner_id uuid)
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT max(t.tier) FROM public.partner_tiers t
      WHERE t.min_lifetime_referred_usd <= public.partner_lifetime_revenue(_partner_id)),
    0)::smallint;
$$;

CREATE OR REPLACE FUNCTION public.partner_effective_tier(_partner_id uuid)
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT tier_override FROM public.partners WHERE id = _partner_id),
    public.partner_earned_tier(_partner_id)
  )::smallint;
$$;

CREATE OR REPLACE FUNCTION public.partner_commission_rate(_partner_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.rate_pct FROM public.partner_tiers t
  WHERE t.tier = public.partner_effective_tier(_partner_id);
$$;

-- ---------- audited override ----------
CREATE TABLE public.partner_tier_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  from_tier smallint,
  to_tier smallint,
  earned_tier smallint NOT NULL,
  reason text NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_tier_audit TO authenticated;
GRANT ALL ON public.partner_tier_audit TO service_role;
ALTER TABLE public.partner_tier_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read their own tier history" ON public.partner_tier_audit
  FOR SELECT TO authenticated
  USING (public.is_partner_member(partner_id) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.set_partner_tier_override(
  _partner_id uuid, _tier smallint, _reason text
) RETURNS smallint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old smallint; _earned smallint;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'partner not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'a tier override needs a reason' USING ERRCODE = 'check_violation';
  END IF;
  SELECT tier_override INTO _old FROM public.partners WHERE id = _partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner not found' USING ERRCODE = 'no_data_found';
  END IF;
  _earned := public.partner_earned_tier(_partner_id);

  UPDATE public.partners SET tier_override = _tier, updated_at = now() WHERE id = _partner_id;

  INSERT INTO public.partner_tier_audit (partner_id, from_tier, to_tier, earned_tier, reason, actor)
  VALUES (_partner_id, _old, _tier, _earned, btrim(_reason), auth.uid());

  RETURN public.partner_effective_tier(_partner_id);
END;
$$;

-- ---------- accrual (webhook only) ----------
-- Runs with service credentials from the payment webhook. It is the single
-- writer of the ledger, and it is idempotent per (partner, invoice).
CREATE OR REPLACE FUNCTION public.accrue_commission(
  _org_id uuid,
  _invoice_id text,
  _revenue_usd numeric,
  _subscription_id text DEFAULT NULL,
  _period_start timestamptz DEFAULT NULL,
  _period_end timestamptz DEFAULT NULL,
  _environment text DEFAULT 'live'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _partner uuid; _rate numeric; _id uuid;
BEGIN
  SELECT referred_by_partner_id INTO _partner FROM public.organizations WHERE id = _org_id;
  IF _partner IS NULL THEN
    RETURN NULL; -- not referred; nothing to pay
  END IF;
  IF coalesce(_revenue_usd, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  _rate := public.partner_commission_rate(_partner);

  INSERT INTO public.commission_ledger (
    partner_id, org_id, invoice_id, stripe_subscription_id,
    period_start, period_end, revenue_usd, rate_pct, commission_usd, environment
  ) VALUES (
    _partner, _org_id, _invoice_id, _subscription_id,
    _period_start, _period_end, _revenue_usd, _rate,
    round(_revenue_usd * _rate / 100.0, 2), coalesce(_environment, 'live')
  )
  ON CONFLICT (partner_id, invoice_id) DO NOTHING
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accrue_commission(uuid, text, numeric, text, timestamptz, timestamptz, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_commission(uuid, text, numeric, text, timestamptz, timestamptz, text) TO service_role;
