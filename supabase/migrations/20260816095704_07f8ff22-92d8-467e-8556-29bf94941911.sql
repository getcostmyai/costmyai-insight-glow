CREATE TABLE public.lead_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  visitor_id uuid NOT NULL,
  referred_by_partner_id uuid REFERENCES public.partners(id),
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX lead_events_visitor_idx ON public.lead_events (visitor_id, created_at DESC);
CREATE INDEX lead_events_type_idx ON public.lead_events (event_type, created_at DESC);
CREATE INDEX lead_events_partner_idx ON public.lead_events (referred_by_partner_id) WHERE referred_by_partner_id IS NOT NULL;

GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read lead events"
ON public.lead_events FOR SELECT TO authenticated
USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.lead_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'lead_events is append-only';
END;
$$;

CREATE TRIGGER lead_events_no_update
BEFORE UPDATE OR DELETE ON public.lead_events
FOR EACH ROW EXECUTE FUNCTION public.lead_events_append_only();