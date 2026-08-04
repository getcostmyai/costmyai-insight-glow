
-- 1. Lock down SECURITY DEFINER routines in the exposed public schema.
DO $$
DECLARE
  r record;
  user_facing text[] := ARRAY[
    'accept_invite','apply_switch','attach_referral','benchmark_cut','create_organization',
    'has_org_role','is_org_manager','is_org_member','is_partner_member','is_partner_owner',
    'is_platform_admin','org_is_synthetic','partner_commission_rate','partner_earned_tier',
    'partner_effective_tier','partner_lifetime_revenue','partner_referrals','set_org_plan',
    'set_partner_tier_override','set_switch_state','upsert_recommendation'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname, pg_get_function_result(p.oid) AS res
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.res <> 'trigger' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      IF r.proname = ANY(user_facing) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Trigger helper that is SECURITY INVOKER but still needs no direct callers.
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- 2. Explicit storage rules: the private handover bucket is platform-admin only.
CREATE POLICY "Platform admins read handover files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'costmyaihandoverreplit' AND public.is_platform_admin());

CREATE POLICY "Platform admins upload handover files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'costmyaihandoverreplit' AND public.is_platform_admin());

CREATE POLICY "Platform admins update handover files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'costmyaihandoverreplit' AND public.is_platform_admin())
WITH CHECK (bucket_id = 'costmyaihandoverreplit' AND public.is_platform_admin());

CREATE POLICY "Platform admins delete handover files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'costmyaihandoverreplit' AND public.is_platform_admin());
