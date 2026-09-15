ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text;

-- contact_email is the key claim_partner_membership() matches a signing-in
-- user on. A partner editing it could orphan their own account or point it at
-- an address they do not control, so it joins the admin-only set.
CREATE OR REPLACE FUNCTION public.protect_partner_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() OR coalesce(current_setting('app.payout_write', true), '') = '1' THEN
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