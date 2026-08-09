-- Dispatch 161. A switch that is not rerouting has captured nothing.
-- One rule, enforced in the database so no seed, backfill or future migration
-- can reintroduce a pro-rated "captured" figure on a switch that never moved
-- a single request.

CREATE OR REPLACE FUNCTION public.switch_is_executable(_org_id uuid, _from_host text, _to_host text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Not executed by us at all yet, regardless of any grant.
    WHEN lower(btrim(_to_host)) IN ('bedrock', 'aws-bedrock', 'vertex', 'vertex-ai', 'vertex_ai')
      THEN false
    -- Same provider: the destination must at least be connected.
    WHEN lower(btrim(_from_host)) = lower(btrim(_to_host)) THEN EXISTS (
      SELECT 1 FROM public.org_provider_routing r
      WHERE r.org_id = _org_id
        AND lower(btrim(r.host)) = lower(btrim(_to_host))
        AND r.revoked_at IS NULL
    )
    -- Different provider: routing to the destination must be explicitly granted.
    ELSE EXISTS (
      SELECT 1 FROM public.org_provider_routing r
      WHERE r.org_id = _org_id
        AND lower(btrim(r.host)) = lower(btrim(_to_host))
        AND r.revoked_at IS NULL
        AND r.granted
    )
  END
$$;

REVOKE ALL ON FUNCTION public.switch_is_executable(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_savings_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.saved_usd IS DISTINCT FROM 0
     AND NOT public.switch_is_executable(NEW.org_id, NEW.from_host, NEW.to_host) THEN
    NEW.saved_usd := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_savings_gate ON public.switches;
CREATE TRIGGER enforce_savings_gate
BEFORE INSERT OR UPDATE ON public.switches
FOR EACH ROW EXECUTE FUNCTION public.enforce_savings_gate();

-- Zero what the old pro-rating seed left behind.
UPDATE public.switches s
SET saved_usd = 0, updated_at = now()
WHERE s.saved_usd <> 0
  AND NOT public.switch_is_executable(s.org_id, s.from_host, s.to_host);