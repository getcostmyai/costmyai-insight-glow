-- 1. Profiles: let a signed-in user create their own row (no auth-schema trigger).
CREATE POLICY "own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- 2. Atomic workspace bootstrap: org + membership + owner role in one call.
--    user_roles has no INSERT policy by design, so this is the only path to a role.
CREATE OR REPLACE FUNCTION public.create_organization(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org_id uuid;
  _base text;
  _slug text;
  _n int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'workspace name is required' USING ERRCODE = 'check_violation';
  END IF;

  _base := regexp_replace(lower(btrim(_name)), '[^a-z0-9]+', '-', 'g');
  _base := btrim(_base, '-');
  IF _base = '' THEN _base := 'workspace'; END IF;
  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = _slug) LOOP
    _n := _n + 1;
    _slug := _base || '-' || _n::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, plan, created_by, is_synthetic)
  VALUES (btrim(_name), _slug, 'compare', _uid, false)
  RETURNING id INTO _org_id;

  INSERT INTO public.memberships (org_id, user_id) VALUES (_org_id, _uid);
  INSERT INTO public.user_roles (org_id, user_id, role) VALUES (_org_id, _uid, 'owner');

  RETURN _org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text) TO authenticated;

-- 3. Plan changes are owner-only, and the demo workspace is immutable.
CREATE OR REPLACE FUNCTION public.set_org_plan(_org_id uuid, _plan plan_tier)
RETURNS plan_tier
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _synthetic boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_org_role(_org_id, 'owner') THEN
    RAISE EXCEPTION 'only the workspace owner can change the plan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT is_synthetic INTO _synthetic FROM public.organizations WHERE id = _org_id;
  IF _synthetic THEN
    RAISE EXCEPTION 'the demo workspace plan is fixed' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.organizations SET plan = _plan, updated_at = now() WHERE id = _org_id;
  RETURN _plan;
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_plan(uuid, plan_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_org_plan(uuid, plan_tier) TO authenticated;

-- 4. Nobody can join the demo workspace, not even by inserting their own membership.
CREATE OR REPLACE FUNCTION public.block_synthetic_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT is_synthetic FROM public.organizations WHERE id = NEW.org_id) THEN
    RAISE EXCEPTION 'the demo workspace does not accept members' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_block_synthetic
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.block_synthetic_membership();