REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_partner_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_partner_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.attach_referral(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_lifetime_revenue(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_earned_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_effective_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_commission_rate(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_partner_tier_override(uuid, smallint, text) FROM anon;