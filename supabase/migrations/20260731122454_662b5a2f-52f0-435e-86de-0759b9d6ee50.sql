-- Demo/real isolation: a helper, a hardened write-side guard, and a read-side
-- predicate on every table that carries the flag.

CREATE OR REPLACE FUNCTION public.org_is_synthetic(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.is_synthetic FROM public.organizations o WHERE o.id = _org_id;
$$;

GRANT EXECUTE ON FUNCTION public.org_is_synthetic(uuid) TO anon, authenticated, service_role;

-- Write-side guard. The flag is never taken from the writer: it is always
-- derived from the owning workspace. An unknown workspace is refused rather
-- than defaulted, and the flag cannot be flipped after the fact.
CREATE OR REPLACE FUNCTION public.enforce_synthetic_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE org_synth boolean;
BEGIN
  SELECT is_synthetic INTO org_synth FROM public.organizations WHERE id = NEW.org_id;
  IF org_synth IS NULL THEN
    RAISE EXCEPTION 'unknown org_id % — refusing to write a row that cannot be classified as demo or real', NEW.org_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'org_id is immutable — a row cannot be moved between workspaces'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.is_synthetic = org_synth;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usage_events','usage_rollups','workload_profiles','recommendations',
    'switches','switch_events','routing_rules','objectives','billing_captures'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_synthetic_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER sync_synthetic_%1$s BEFORE INSERT OR UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_synthetic_flag()', t);
  END LOOP;
END $$;

-- Read-side predicate: a member only ever sees rows whose classification
-- matches their own workspace, so a demo row can never be counted into a real
-- customer's aggregate even if one somehow existed.
DROP POLICY IF EXISTS "members read usage" ON public.usage_events;
CREATE POLICY "members read usage" ON public.usage_events FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read rollups" ON public.usage_rollups;
CREATE POLICY "members read rollups" ON public.usage_rollups FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read workloads" ON public.workload_profiles;
CREATE POLICY "members read workloads" ON public.workload_profiles FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read recs" ON public.recommendations;
CREATE POLICY "members read recs" ON public.recommendations FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read switches" ON public.switches;
CREATE POLICY "members read switches" ON public.switches FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read switch events" ON public.switch_events;
CREATE POLICY "members read switch events" ON public.switch_events FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read routing rules" ON public.routing_rules;
CREATE POLICY "members read routing rules" ON public.routing_rules FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read objectives" ON public.objectives;
CREATE POLICY "members read objectives" ON public.objectives FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

DROP POLICY IF EXISTS "members read billing captures" ON public.billing_captures;
CREATE POLICY "members read billing captures" ON public.billing_captures FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND is_synthetic = org_is_synthetic(org_id));

-- Reconciliations carry no flag of their own; they inherit it from the capture.
DROP POLICY IF EXISTS "members read billing reconciliations" ON public.billing_reconciliations;
CREATE POLICY "members read billing reconciliations" ON public.billing_reconciliations FOR SELECT TO authenticated
  USING (
    is_org_member(org_id) AND EXISTS (
      SELECT 1 FROM public.billing_captures c
      WHERE c.id = capture_id AND c.org_id = billing_reconciliations.org_id
        AND c.is_synthetic = org_is_synthetic(billing_reconciliations.org_id)
    )
  );

-- The public demo surface may only ever read rows explicitly marked as demo data.
DROP POLICY IF EXISTS "public read demo rollups" ON public.usage_rollups;
CREATE POLICY "public read demo rollups" ON public.usage_rollups FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo workloads" ON public.workload_profiles;
CREATE POLICY "public read demo workloads" ON public.workload_profiles FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo recs" ON public.recommendations;
CREATE POLICY "public read demo recs" ON public.recommendations FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo switches" ON public.switches;
CREATE POLICY "public read demo switches" ON public.switches FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo routing rules" ON public.routing_rules;
CREATE POLICY "public read demo routing rules" ON public.routing_rules FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo objectives" ON public.objectives;
CREATE POLICY "public read demo objectives" ON public.objectives FOR SELECT TO anon
  USING (org_id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);

DROP POLICY IF EXISTS "public read demo org" ON public.organizations;
CREATE POLICY "public read demo org" ON public.organizations FOR SELECT TO anon
  USING (id = '00000000-0000-0000-0000-000000000001'::uuid AND is_synthetic);