-- Turn an application into a real partner account. Platform admin only.
CREATE OR REPLACE FUNCTION public.provision_partner_from_application(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.partner_applications%ROWTYPE;
  existing public.partners%ROWTYPE;
  base text;
  code text;
  n int := 0;
  pid uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO app FROM public.partner_applications WHERE id = _application_id;
  IF app.id IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  -- Idempotent: one partner per applicant email.
  SELECT * INTO existing FROM public.partners WHERE lower(contact_email) = lower(app.email) LIMIT 1;
  IF existing.id IS NOT NULL THEN
    UPDATE public.partner_applications
       SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     WHERE id = _application_id;
    RETURN jsonb_build_object('partner_id', existing.id, 'referral_code', existing.referral_code, 'created', false);
  END IF;

  base := upper(regexp_replace(coalesce(nullif(app.company, ''), app.last_name), '[^a-zA-Z0-9]', '', 'g'));
  base := left(nullif(base, ''), 12);
  IF base IS NULL THEN base := 'PARTNER'; END IF;
  code := base;
  WHILE EXISTS (SELECT 1 FROM public.partners WHERE upper(referral_code) = code) LOOP
    n := n + 1;
    code := left(base, 10) || n::text;
  END LOOP;

  INSERT INTO public.partners (name, referral_code, contact_email, status, created_by)
  VALUES (coalesce(nullif(app.company, ''), app.first_name || ' ' || app.last_name),
          code, lower(app.email), 'active', auth.uid())
  RETURNING id INTO pid;

  UPDATE public.partner_applications
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('partner_id', pid, 'referral_code', code, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_partner_from_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_partner_from_application(uuid) TO authenticated;

-- The approved person links their own account by signing in with the email
-- they applied with. Email must be confirmed; no argument is trusted.
CREATE OR REPLACE FUNCTION public.claim_partner_membership()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  mail text;
  confirmed timestamptz;
  pid uuid;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;

  SELECT lower(email), email_confirmed_at INTO mail, confirmed FROM auth.users WHERE id = uid;
  IF mail IS NULL OR confirmed IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO pid FROM public.partners
   WHERE lower(contact_email) = mail AND status = 'active'
   ORDER BY created_at LIMIT 1;
  IF pid IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.partner_users (partner_id, user_id, role)
  VALUES (pid, uid, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN pid;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_partner_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_partner_membership() TO authenticated;