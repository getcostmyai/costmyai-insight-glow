CREATE TABLE public.intelligence_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detector text NOT NULL,
  dedupe_key text NOT NULL,
  severity text NOT NULL DEFAULT 'watch',
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  editor_note text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_leads_dedupe UNIQUE (detector, dedupe_key),
  CONSTRAINT intelligence_leads_status_check CHECK (status IN ('open','accepted','dismissed','written')),
  CONSTRAINT intelligence_leads_severity_check CHECK (severity IN ('watch','note'))
);

GRANT SELECT, UPDATE ON public.intelligence_leads TO authenticated;
GRANT ALL ON public.intelligence_leads TO service_role;

ALTER TABLE public.intelligence_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read leads"
  ON public.intelligence_leads FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Platform admins triage leads"
  ON public.intelligence_leads FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE TRIGGER intelligence_leads_touch
  BEFORE UPDATE ON public.intelligence_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();