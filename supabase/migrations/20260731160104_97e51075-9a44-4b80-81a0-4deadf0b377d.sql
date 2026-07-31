CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  product_id text,
  price_id text NOT NULL,
  plan public.plan_tier NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_org_id ON public.subscriptions(org_id);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their workspace subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE TRIGGER touch_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.org_has_active_subscription(_org_id uuid, _env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.org_id = _org_id
      AND s.environment = _env
      AND (
        (s.status IN ('active', 'trialing', 'past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  );
$$;