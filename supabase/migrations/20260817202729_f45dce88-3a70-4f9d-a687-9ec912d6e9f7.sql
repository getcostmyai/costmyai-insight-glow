-- Dispatch: grant hardening. Root cause first: the platform default privileges
-- hand every new public table full arwdDxtm to anon and authenticated, so a
-- table is world-writable the moment it exists and only RLS holds the line.
-- Close the default, then retrofit the 43 existing tables so grants match the
-- policies that are already the real gate. Behaviourally a no-op.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

REVOKE ALL ON public.api_keys FROM anon, authenticated;
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
REVOKE ALL ON public.backup_export_runs FROM anon, authenticated;
GRANT SELECT ON public.backup_export_runs TO authenticated;
GRANT ALL ON public.backup_export_runs TO service_role;
REVOKE ALL ON public.benchmark_margins FROM anon, authenticated;
GRANT SELECT ON public.benchmark_margins TO anon;
GRANT SELECT ON public.benchmark_margins TO authenticated;
GRANT ALL ON public.benchmark_margins TO service_role;
REVOKE ALL ON public.benchmarks FROM anon, authenticated;
GRANT SELECT ON public.benchmarks TO anon;
GRANT SELECT ON public.benchmarks TO authenticated;
GRANT ALL ON public.benchmarks TO service_role;
REVOKE ALL ON public.billing_captures FROM anon, authenticated;
GRANT SELECT ON public.billing_captures TO authenticated;
GRANT ALL ON public.billing_captures TO service_role;
REVOKE ALL ON public.billing_reconciliations FROM anon, authenticated;
GRANT SELECT ON public.billing_reconciliations TO authenticated;
GRANT ALL ON public.billing_reconciliations TO service_role;
REVOKE ALL ON public.commission_ledger FROM anon, authenticated;
GRANT SELECT ON public.commission_ledger TO authenticated;
GRANT ALL ON public.commission_ledger TO service_role;
REVOKE ALL ON public.host_prices FROM anon, authenticated;
GRANT SELECT ON public.host_prices TO anon;
GRANT SELECT ON public.host_prices TO authenticated;
GRANT ALL ON public.host_prices TO service_role;
REVOKE ALL ON public.intelligence_leads FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.intelligence_leads TO authenticated;
GRANT ALL ON public.intelligence_leads TO service_role;
REVOKE ALL ON public.job_config FROM anon, authenticated;
GRANT ALL ON public.job_config TO service_role;
REVOKE ALL ON public.lead_events FROM anon, authenticated;
GRANT SELECT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;
REVOKE ALL ON public.memberships FROM anon, authenticated;
GRANT INSERT, DELETE, SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
REVOKE ALL ON public.model_aliases FROM anon, authenticated;
GRANT SELECT ON public.model_aliases TO anon;
GRANT SELECT ON public.model_aliases TO authenticated;
GRANT ALL ON public.model_aliases TO service_role;
REVOKE ALL ON public.model_catalog FROM anon, authenticated;
GRANT SELECT ON public.model_catalog TO anon;
GRANT SELECT ON public.model_catalog TO authenticated;
GRANT ALL ON public.model_catalog TO service_role;
REVOKE ALL ON public.monthly_kpi_snapshot FROM anon, authenticated;
GRANT SELECT ON public.monthly_kpi_snapshot TO anon;
GRANT SELECT ON public.monthly_kpi_snapshot TO authenticated;
GRANT ALL ON public.monthly_kpi_snapshot TO service_role;
REVOKE ALL ON public.objectives FROM anon, authenticated;
GRANT INSERT, DELETE, SELECT, UPDATE ON public.objectives TO authenticated;
GRANT ALL ON public.objectives TO service_role;
REVOKE ALL ON public.org_invites FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;
REVOKE ALL ON public.org_profiles FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.org_profiles TO authenticated;
GRANT ALL ON public.org_profiles TO service_role;
REVOKE ALL ON public.org_provider_routing FROM anon, authenticated;
GRANT SELECT ON public.org_provider_routing TO authenticated;
GRANT ALL ON public.org_provider_routing TO service_role;
REVOKE ALL ON public.organizations FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
REVOKE ALL ON public.partner_applications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;
REVOKE ALL ON public.partner_payouts FROM anon, authenticated;
GRANT SELECT ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
REVOKE ALL ON public.partner_tier_audit FROM anon, authenticated;
GRANT SELECT ON public.partner_tier_audit TO authenticated;
GRANT ALL ON public.partner_tier_audit TO service_role;
REVOKE ALL ON public.partner_tiers FROM anon, authenticated;
GRANT SELECT ON public.partner_tiers TO anon;
GRANT SELECT ON public.partner_tiers TO authenticated;
GRANT ALL ON public.partner_tiers TO service_role;
REVOKE ALL ON public.partner_users FROM anon, authenticated;
GRANT SELECT ON public.partner_users TO authenticated;
GRANT ALL ON public.partner_users TO service_role;
REVOKE ALL ON public.partners FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
REVOKE ALL ON public.plan_entitlements FROM anon, authenticated;
GRANT SELECT ON public.plan_entitlements TO anon;
GRANT SELECT ON public.plan_entitlements TO authenticated;
GRANT ALL ON public.plan_entitlements TO service_role;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;
REVOKE ALL ON public.price_history FROM anon, authenticated;
GRANT SELECT ON public.price_history TO anon;
GRANT SELECT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
REVOKE ALL ON public.pricing_snapshots FROM anon, authenticated;
GRANT SELECT ON public.pricing_snapshots TO anon;
GRANT SELECT ON public.pricing_snapshots TO authenticated;
GRANT ALL ON public.pricing_snapshots TO service_role;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
REVOKE ALL ON public.recommendations FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
REVOKE ALL ON public.routing_rules FROM anon, authenticated;
GRANT INSERT, DELETE, SELECT, UPDATE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
REVOKE ALL ON public.switch_events FROM anon, authenticated;
GRANT SELECT ON public.switch_events TO authenticated;
GRANT ALL ON public.switch_events TO service_role;
REVOKE ALL ON public.switch_fallbacks FROM anon, authenticated;
GRANT SELECT ON public.switch_fallbacks TO authenticated;
GRANT ALL ON public.switch_fallbacks TO service_role;
REVOKE ALL ON public.switches FROM anon, authenticated;
GRANT SELECT ON public.switches TO authenticated;
GRANT ALL ON public.switches TO service_role;
REVOKE ALL ON public.sync_runs FROM anon, authenticated;
GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;
REVOKE ALL ON public.task_drift_observations FROM anon, authenticated;
GRANT SELECT ON public.task_drift_observations TO authenticated;
GRANT ALL ON public.task_drift_observations TO service_role;
REVOKE ALL ON public.usage_events FROM anon, authenticated;
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
REVOKE ALL ON public.usage_rollups FROM anon, authenticated;
GRANT SELECT ON public.usage_rollups TO authenticated;
GRANT ALL ON public.usage_rollups TO service_role;
REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
REVOKE ALL ON public.workload_profiles FROM anon, authenticated;
GRANT SELECT ON public.workload_profiles TO authenticated;
GRANT ALL ON public.workload_profiles TO service_role;

-- Sequences: only server-side code inserts into the sequence-backed table
-- (usage_events), so no end-user role needs nextval.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Views are security_invoker, so they inherit the base-table policies.
REVOKE ALL ON public.current_prices FROM anon, authenticated;
GRANT SELECT ON public.current_prices TO anon, authenticated;
REVOKE ALL ON public.funnel_summary FROM anon, authenticated;
GRANT SELECT ON public.funnel_summary TO authenticated;

-- Oracle functions. Each took an id from the caller and answered about it with
-- no authorization check. The guard returns NULL rather than raising, because
-- these are evaluated inside RLS policies where an exception would abort the
-- whole statement instead of simply denying a row. Internal callers (triggers,
-- cron, service-role code) have no auth.uid() and are unaffected.
CREATE OR REPLACE FUNCTION public.org_entitled_to(_org_id uuid, _required plan_tier)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL
         AND NOT (public.is_org_member(_org_id) OR public.is_platform_admin())
      THEN NULL
    WHEN public.plan_rank(_required) = 0 THEN true
    ELSE
      COALESCE((SELECT public.plan_rank(o.plan) FROM public.organizations o WHERE o.id = _org_id), -1)
        >= public.plan_rank(_required)
      AND EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.org_id = _org_id
          AND public.plan_rank(s.plan) >= public.plan_rank(_required)
          AND (
            (s.status IN ('active','trialing','past_due')
              AND (s.current_period_end IS NULL OR s.current_period_end > now()))
            OR (s.status = 'canceled' AND s.current_period_end > now())
          )
      )
  END;
$$;

CREATE OR REPLACE FUNCTION public.org_is_synthetic(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL
         AND NOT (public.is_org_member(_org_id) OR public.is_platform_admin())
      THEN NULL
    ELSE (SELECT o.is_synthetic FROM public.organizations o WHERE o.id = _org_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_partner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_platform_admin()
      THEN NULL
    ELSE EXISTS (
      SELECT 1
      FROM public.partner_users pu
      JOIN public.partners p ON p.id = pu.partner_id
      WHERE pu.user_id = _user_id
        AND p.status = 'active'
    )
  END;
$$;

-- org_is_synthetic was reachable with no session at all; that grant goes.
REVOKE ALL ON FUNCTION public.org_is_synthetic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.org_entitled_to(uuid, plan_tier) FROM anon;
REVOKE ALL ON FUNCTION public.is_active_partner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_is_synthetic(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_entitled_to(uuid, plan_tier) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_partner(uuid) TO authenticated, service_role;