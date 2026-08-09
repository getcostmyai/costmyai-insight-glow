CREATE TABLE public.switch_fallbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  switch_id uuid NOT NULL REFERENCES public.switches(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('connection_error','model_not_found','unsupported_parameter','destination_4xx')),
  status_code integer,
  model_key text,
  host text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX switch_fallbacks_idem_idx
  ON public.switch_fallbacks (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX switch_fallbacks_window_idx
  ON public.switch_fallbacks (switch_id, occurred_at DESC);

GRANT SELECT ON public.switch_fallbacks TO authenticated;
GRANT ALL ON public.switch_fallbacks TO service_role;

ALTER TABLE public.switch_fallbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own workspace fallbacks"
  ON public.switch_fallbacks FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));