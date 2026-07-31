CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_invites_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT org_invites_email_shape CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

CREATE UNIQUE INDEX org_invites_one_open_per_email
  ON public.org_invites (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX org_invites_email_idx ON public.org_invites (email);

GRANT SELECT, INSERT, UPDATE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers see their workspace invites"
  ON public.org_invites FOR SELECT TO authenticated
  USING (public.is_org_manager(org_id));

CREATE POLICY "Invitees see invites addressed to them"
  ON public.org_invites FOR SELECT TO authenticated
  USING (email = lower(coalesce(auth.jwt() ->> 'email', '')));

CREATE POLICY "Managers send invites"
  ON public.org_invites FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_manager(org_id)
    AND invited_by = auth.uid()
    AND NOT public.org_is_synthetic(org_id)
  );

CREATE POLICY "Managers revoke invites"
  ON public.org_invites FOR UPDATE TO authenticated
  USING (public.is_org_manager(org_id))
  WITH CHECK (public.is_org_manager(org_id));

CREATE OR REPLACE FUNCTION public.accept_invite(_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _inv public.org_invites%ROWTYPE;
BEGIN
  IF _uid IS NULL OR _email = '' THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _inv FROM public.org_invites WHERE id = _invite_id;

  -- The invitation is matched to the caller's own verified address. Nothing the
  -- client sends decides who is being added.
  IF _inv.id IS NULL OR _inv.email <> _email THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF _inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation already used' USING ERRCODE = 'check_violation';
  END IF;
  IF _inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation was revoked' USING ERRCODE = 'check_violation';
  END IF;
  IF _inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation has expired' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.memberships (org_id, user_id)
  VALUES (_inv.org_id, _uid)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles (org_id, user_id, role)
  VALUES (_inv.org_id, _uid, _inv.role)
  ON CONFLICT (org_id, user_id, role) DO NOTHING;

  UPDATE public.org_invites
  SET accepted_at = now(), accepted_by = _uid
  WHERE id = _inv.id;

  RETURN _inv.org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;