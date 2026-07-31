CREATE TYPE public.partner_application_status AS ENUM ('pending','reviewed','approved','rejected');
CREATE TYPE public.partner_application_path AS ENUM ('meeting','async');

CREATE TABLE public.partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  company text NOT NULL,
  active_clients_bucket text NOT NULL,
  starting_soon_bucket text NOT NULL,
  routed_path public.partner_application_path NOT NULL,
  escalated boolean NOT NULL DEFAULT false,
  status public.partner_application_status NOT NULL DEFAULT 'pending',
  reviewer_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notified_at timestamptz,
  notify_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX partner_applications_created_idx ON public.partner_applications (created_at DESC);
CREATE INDEX partner_applications_email_idx ON public.partner_applications (lower(email));

GRANT SELECT, UPDATE ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins read applications"
  ON public.partner_applications FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform admins review applications"
  ON public.partner_applications FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE TRIGGER partner_applications_touch
  BEFORE UPDATE ON public.partner_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();