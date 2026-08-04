-- 1. objectives: role was checked, entitlement was assumed.
DROP POLICY IF EXISTS "managers insert objectives" ON public.objectives;
DROP POLICY IF EXISTS "managers update objectives" ON public.objectives;

CREATE POLICY "managers insert objectives" ON public.objectives
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_manager(org_id) AND public.org_entitled_to(org_id, 'certify'));

CREATE POLICY "managers update objectives" ON public.objectives
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(org_id))
  WITH CHECK (public.is_org_manager(org_id) AND public.org_entitled_to(org_id, 'certify'));

-- 2. routing_rules: manual routing is Rightsize, autonomous routing is Govern.
DROP POLICY IF EXISTS "managers write routing rules" ON public.routing_rules;
DROP POLICY IF EXISTS "managers update routing rules" ON public.routing_rules;

CREATE POLICY "managers write routing rules" ON public.routing_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_manager(org_id)
    AND public.org_entitled_to(org_id, 'rightsize')
    AND (source <> 'autonomous' OR public.org_entitled_to(org_id, 'govern'))
  );

CREATE POLICY "managers update routing rules" ON public.routing_rules
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(org_id))
  WITH CHECK (
    public.is_org_manager(org_id)
    AND (state <> 'active' OR public.org_entitled_to(org_id, 'rightsize'))
    AND (source <> 'autonomous' OR state <> 'active' OR public.org_entitled_to(org_id, 'govern'))
  );

-- 3. organizations: the manager update policy let a manager write plan and
--    autonomous_enabled straight through PostgREST. Same shape of gap.
CREATE OR REPLACE FUNCTION public.protect_org_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Paid levels come from a signed checkout webhook (service_role) only.
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND public.plan_rank(NEW.plan) > 0
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'paid levels are set by checkout, not by request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Autonomous switching is the Govern level, restated for a direct write.
  IF NEW.autonomous_enabled AND NOT coalesce(OLD.autonomous_enabled, false)
     AND NOT public.org_entitled_to(NEW.id, 'govern') THEN
    RAISE EXCEPTION 'this workspace is not on the govern plan'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_protect_plan ON public.organizations;
CREATE TRIGGER organizations_protect_plan
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_org_plan_columns();

REVOKE ALL ON FUNCTION public.protect_org_plan_columns() FROM PUBLIC, anon, authenticated;