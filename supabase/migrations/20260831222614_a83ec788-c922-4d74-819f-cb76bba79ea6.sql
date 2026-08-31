-- Newsletter foundation: subscribers, issues, per-issue send log.
--
-- Tenancy note: enforce_synthetic_flag() derives is_synthetic from NEW.org_id
-- and raises when that org is unknown, so it cannot govern an org-less table.
-- Newsletter subscribers are site visitors, not workspace members, so there is
-- no org to derive from. We follow the existing org-less precedent
-- (public.lead_events): is_synthetic defaults to false. We go one step further
-- than lead_events and pin the value in a trigger, so no writer — app code
-- included — can classify newsletter data as demo data.

CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','unsubscribed','bounced')),
  source text,
  visitor_id uuid,
  session_id uuid,
  referred_by_partner_id uuid REFERENCES public.partners(id),
  confirm_token text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX newsletter_subscribers_email_key
  ON public.newsletter_subscribers (lower(email));
CREATE INDEX newsletter_subscribers_status_idx
  ON public.newsletter_subscribers (status, created_at DESC) WHERE is_synthetic = false;
CREATE UNIQUE INDEX newsletter_subscribers_confirm_token_key
  ON public.newsletter_subscribers (confirm_token) WHERE confirm_token IS NOT NULL;

CREATE TABLE public.newsletter_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  markdown_body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_issues_status_idx ON public.newsletter_issues (status, created_at DESC);

CREATE TABLE public.newsletter_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.newsletter_issues(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced')),
  is_synthetic boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, subscriber_id)
);

CREATE INDEX newsletter_sends_issue_idx ON public.newsletter_sends (issue_id, status);

-- Grants: no anon, and no authenticated write path. Every mutation goes through
-- server code holding the service role; admins read through RLS below.
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT SELECT ON public.newsletter_issues TO authenticated;
GRANT SELECT ON public.newsletter_sends TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
GRANT ALL ON public.newsletter_issues TO service_role;
GRANT ALL ON public.newsletter_sends TO service_role;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

-- Only platform admins read. No anon policy at all, so anon is default-denied.
-- Public archive reads are a later phase and get their own explicit policy.
CREATE POLICY "admins read newsletter subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admins read newsletter issues" ON public.newsletter_issues
  FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "admins read newsletter sends" ON public.newsletter_sends
  FOR SELECT TO authenticated USING (is_platform_admin());

-- Org-less synthetic pin. Real newsletter data can never be written as demo.
CREATE OR REPLACE FUNCTION public.pin_synthetic_false()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_synthetic = false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pin_synthetic_newsletter_subscribers
  BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.pin_synthetic_false();

CREATE TRIGGER pin_synthetic_newsletter_sends
  BEFORE INSERT OR UPDATE ON public.newsletter_sends
  FOR EACH ROW EXECUTE FUNCTION public.pin_synthetic_false();

CREATE TRIGGER touch_newsletter_issues
  BEFORE UPDATE ON public.newsletter_issues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();