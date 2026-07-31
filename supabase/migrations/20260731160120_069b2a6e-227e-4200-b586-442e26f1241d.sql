REVOKE EXECUTE ON FUNCTION public.org_has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_active_subscription(uuid, text) TO service_role;