
CREATE OR REPLACE FUNCTION public.partner_summary(_partner_id uuid)
RETURNS TABLE(lifetime_revenue_usd numeric, earned_tier smallint, effective_tier smallint, rate_pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- The caller may only see the figures for a partner account they belong to.
  -- A partner id in a request body can therefore never reach someone else's earnings.
  SELECT public.partner_lifetime_revenue(_partner_id),
         public.partner_earned_tier(_partner_id),
         public.partner_effective_tier(_partner_id),
         public.partner_commission_rate(_partner_id)
  WHERE public.is_partner_member(_partner_id) OR public.is_platform_admin();
$$;

REVOKE ALL ON FUNCTION public.partner_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_summary(uuid) TO authenticated, service_role;

-- These four take an arbitrary partner id and carry no membership check of their
-- own. They stay available to internal SECURITY DEFINER callers and the backend
-- service, but signed-in clients must go through partner_summary above.
REVOKE EXECUTE ON FUNCTION public.partner_lifetime_revenue(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_earned_tier(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_effective_tier(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_commission_rate(uuid) FROM authenticated;
