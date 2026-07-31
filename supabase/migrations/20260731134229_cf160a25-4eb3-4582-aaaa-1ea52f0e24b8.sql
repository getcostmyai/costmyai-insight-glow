-- org_is_synthetic() is used by write-side protection, never by an anon policy.
-- Signed-out visitors have no reason to call it, so drop the implicit PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.org_is_synthetic(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.org_is_synthetic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_is_synthetic(uuid) TO authenticated, service_role;