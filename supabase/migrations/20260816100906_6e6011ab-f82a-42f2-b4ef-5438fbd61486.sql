ALTER TABLE public.organizations ADD COLUMN first_visitor_id uuid;

CREATE INDEX organizations_first_visitor_idx ON public.organizations (first_visitor_id) WHERE first_visitor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.freeze_first_visitor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Captured once, at workspace creation, and never rewritten: the whole
  -- point of the column is that it records the visit that actually led here.
  IF OLD.first_visitor_id IS NOT NULL
     AND NEW.first_visitor_id IS DISTINCT FROM OLD.first_visitor_id THEN
    RAISE EXCEPTION 'first_visitor_id is set once and never changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_first_visitor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS organizations_freeze_first_visitor ON public.organizations;
CREATE TRIGGER organizations_freeze_first_visitor
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.freeze_first_visitor();