CREATE TABLE public.org_stripe_customers (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  stripe_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, environment),
  CONSTRAINT org_stripe_customers_customer_unique UNIQUE (environment, stripe_customer_id)
);

GRANT SELECT ON public.org_stripe_customers TO authenticated;
GRANT ALL ON public.org_stripe_customers TO service_role;

ALTER TABLE public.org_stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their workspace customer"
ON public.org_stripe_customers FOR SELECT TO authenticated
USING (public.is_org_member(org_id));

INSERT INTO public.org_stripe_customers (org_id, environment, stripe_customer_id)
SELECT DISTINCT ON (s.org_id, s.environment) s.org_id, s.environment, s.stripe_customer_id
FROM public.subscriptions s
WHERE s.stripe_customer_id IS NOT NULL
  AND s.environment IN ('sandbox','live')
ORDER BY s.org_id, s.environment,
  (s.status IN ('active','trialing','past_due')) DESC,
  s.created_at DESC
ON CONFLICT DO NOTHING;