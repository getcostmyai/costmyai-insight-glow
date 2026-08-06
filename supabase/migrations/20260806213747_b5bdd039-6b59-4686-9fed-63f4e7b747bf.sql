CREATE OR REPLACE FUNCTION public.partner_badge(_code text)
RETURNS TABLE(partner_name text, tier smallint, tier_name text, rate_pct numeric, joined_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.name, t.tier, t.name, t.rate_pct, p.created_at
  FROM public.partners p
  JOIN public.partner_tiers t ON t.tier = public.partner_effective_tier(p.id)
  WHERE upper(p.referral_code) = upper(_code)
    AND p.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.partner_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_badge(text) TO anon, authenticated, service_role;