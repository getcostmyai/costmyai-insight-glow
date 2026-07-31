-- A partner is not a member of the workspaces it referred, so it cannot read
-- the organizations table at all. This returns the three facts a partner is
-- entitled to and nothing else — no spend, no usage, no people. Restricting
-- columns is the whole point, which is why it is a function, not a policy.
CREATE OR REPLACE FUNCTION public.partner_referrals(_partner_id uuid)
RETURNS TABLE (id uuid, name text, plan public.plan_tier, referred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.plan, o.referred_at
  FROM public.organizations o
  WHERE o.referred_by_partner_id = _partner_id
    AND (public.is_partner_member(_partner_id) OR public.is_platform_admin())
  ORDER BY o.referred_at DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_referrals(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.partner_referrals(uuid) TO authenticated, service_role;