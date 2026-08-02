-- The protection rule must block the partner's own edits, not CostMyAI's own
-- server-side writes. The two server functions mark their write with a
-- transaction-local flag that only they can set.
CREATE OR REPLACE FUNCTION public.protect_partner_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() OR coalesce(current_setting('app.payout_write', true), '') = '1' THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.tier_override IS DISTINCT FROM OLD.tier_override THEN
    RAISE EXCEPTION 'referral code, status and tier are set by CostMyAI, not by the partner'
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

CREATE OR REPLACE FUNCTION public.partner_set_connect_account(
  _partner_id uuid,
  _account_id text,
  _status text,
  _environment text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('not_started','pending','active','restricted') THEN
    RAISE EXCEPTION 'unknown payout account status %', _status;
  END IF;
  PERFORM set_config('app.payout_write', '1', true);
  UPDATE public.partners
     SET stripe_connect_account_id = coalesce(_account_id, stripe_connect_account_id),
         stripe_connect_status = _status,
         stripe_connect_environment = coalesce(_environment, stripe_connect_environment),
         stripe_connect_updated_at = now(),
         updated_at = now()
   WHERE id = _partner_id;
  PERFORM set_config('app.payout_write', '0', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.partner_set_connect_account(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_connect_account(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_set_connect_status_by_account(
  _account_id text,
  _status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _status NOT IN ('not_started','pending','active','restricted') THEN
    RAISE EXCEPTION 'unknown payout account status %', _status;
  END IF;
  PERFORM set_config('app.payout_write', '1', true);
  UPDATE public.partners
     SET stripe_connect_status = _status,
         stripe_connect_updated_at = now(),
         updated_at = now()
   WHERE stripe_connect_account_id = _account_id
   RETURNING id INTO _id;
  PERFORM set_config('app.payout_write', '0', true);
  RETURN _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.partner_set_connect_status_by_account(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_connect_status_by_account(text, text) TO service_role;