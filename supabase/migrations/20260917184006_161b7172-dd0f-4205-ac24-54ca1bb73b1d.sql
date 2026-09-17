-- 1. Neutral code generator -------------------------------------------------
-- Crypto-secure (gen_random_bytes), 8 characters, alphabet excludes the
-- characters people confuse when reading a code aloud or retyping it from a
-- slide: O, 0, I, 1, L.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 characters
  out_code text := '';
  raw bytea;
  i int;
BEGIN
  raw := extensions.gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    out_code := out_code || substr(alphabet, (get_byte(raw, i) % 31) + 1, 1);
  END LOOP;
  RETURN out_code;
END;
$$;

-- Unique-or-fail. Never returns a colliding code, never returns silently.
CREATE OR REPLACE FUNCTION public.mint_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  candidate text;
  attempt int := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    candidate := public.generate_referral_code();
    IF NOT EXISTS (SELECT 1 FROM public.partners WHERE upper(referral_code) = candidate) THEN
      RETURN candidate;
    END IF;
    IF attempt >= 25 THEN
      RAISE EXCEPTION 'could not mint a unique referral code after % attempts', attempt;
    END IF;
  END LOOP;
END;
$$;

-- 2. Approval path now mints a neutral code ----------------------------------
CREATE OR REPLACE FUNCTION public.provision_partner_from_application(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  app public.partner_applications%ROWTYPE;
  existing public.partners%ROWTYPE;
  code text;
  pid uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO app FROM public.partner_applications WHERE id = _application_id;
  IF app.id IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  SELECT * INTO existing FROM public.partners WHERE lower(contact_email) = lower(app.email) LIMIT 1;
  IF existing.id IS NOT NULL THEN
    UPDATE public.partner_applications
       SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     WHERE id = _application_id;
    RETURN jsonb_build_object('partner_id', existing.id, 'referral_code', existing.referral_code, 'created', false);
  END IF;

  -- Deliberately NOT derived from company or surname: a code carrying the
  -- partner's name tells the recipient the sender is paid before they have
  -- looked at anything.
  code := public.mint_referral_code();

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

-- 3. Audit trail for reissues ------------------------------------------------
CREATE TABLE public.partner_code_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  previous_code text NOT NULL,
  new_code text NOT NULL,
  actor uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_code_audit TO authenticated;
GRANT ALL ON public.partner_code_audit TO service_role;

ALTER TABLE public.partner_code_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins read code reissues"
ON public.partner_code_audit
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

CREATE INDEX partner_code_audit_partner_idx ON public.partner_code_audit (partner_id, created_at DESC);

-- 4. Keep the partner-side protection, add a narrow privileged escape --------
-- The reissue routine and the backfill below run with no auth.uid(), so the
-- trigger needs an explicit, named, transaction-local flag rather than a
-- weakened rule.
CREATE OR REPLACE FUNCTION public.protect_partner_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_platform_admin()
     OR coalesce(current_setting('app.payout_write', true), '') = '1'
     OR coalesce(current_setting('app.code_reissue', true), '') = '1' THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.tier_override IS DISTINCT FROM OLD.tier_override
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email THEN
    RAISE EXCEPTION 'referral code, contact email, status and tier are set by CostMyAI, not by the partner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id
     OR NEW.stripe_connect_status IS DISTINCT FROM OLD.stripe_connect_status
     OR NEW.stripe_connect_environment IS DISTINCT FROM OLD.stripe_connect_environment THEN
    RAISE EXCEPTION 'payout account state is set by the payment provider, not by the partner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 5. Admin-only reissue ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reissue_referral_code(_partner_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_code text;
  code text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT referral_code INTO old_code FROM public.partners WHERE id = _partner_id;
  IF old_code IS NULL THEN
    RAISE EXCEPTION 'partner not found';
  END IF;

  code := public.mint_referral_code();

  PERFORM set_config('app.code_reissue', '1', true);
  UPDATE public.partners SET referral_code = code WHERE id = _partner_id;
  PERFORM set_config('app.code_reissue', '', true);

  INSERT INTO public.partner_code_audit (partner_id, previous_code, new_code, actor, reason)
  VALUES (_partner_id, old_code, code, auth.uid(), nullif(btrim(coalesce(_reason, '')), ''));

  RETURN jsonb_build_object('partner_id', _partner_id, 'previous_code', old_code, 'referral_code', code);
END;
$$;

REVOKE ALL ON FUNCTION public.reissue_referral_code(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reissue_referral_code(uuid, text) TO authenticated, service_role;

-- 6. Backfill the four real partners ----------------------------------------
-- TESTCODE, drill-1787138170418 and CHAINDRILL are internal rows and stay.
DO $$
DECLARE
  r record;
  code text;
BEGIN
  PERFORM set_config('app.code_reissue', '1', true);
  FOR r IN
    SELECT id, referral_code FROM public.partners
     WHERE referral_code IN ('HOWNOT', 'PETERSCHMIDT', 'SLAEPPLE09', 'DALKORBEQUI')
  LOOP
    code := public.mint_referral_code();
    UPDATE public.partners SET referral_code = code WHERE id = r.id;
    INSERT INTO public.partner_code_audit (partner_id, previous_code, new_code, actor, reason)
    VALUES (r.id, r.referral_code, code, NULL,
            'Global reissue: name-derived codes retired so a referral link does not disclose the sender is paid');
  END LOOP;
  PERFORM set_config('app.code_reissue', '', true);
END $$;
