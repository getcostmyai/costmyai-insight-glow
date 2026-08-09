CREATE TABLE public.org_provider_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  host text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  container_id text,
  first_granted_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, host)
);

COMMENT ON TABLE public.org_provider_routing IS
  'Dispatch 155. Signal 2 of provider-gated switching: the customer has given a specific container its own credential for this destination provider. Asserted by the container over the authenticated ingest channel, never entered in the UI, never inferred from traffic. The credential itself stays in the customer''s own infrastructure and is never sent here.';

GRANT SELECT ON public.org_provider_routing TO authenticated;
GRANT ALL ON public.org_provider_routing TO service_role;

ALTER TABLE public.org_provider_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their workspace routing grants"
  ON public.org_provider_routing
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX org_provider_routing_org_idx ON public.org_provider_routing (org_id, host);

CREATE TRIGGER touch_org_provider_routing
  BEFORE UPDATE ON public.org_provider_routing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();