-- org_plan() is only ever needed server-side; nothing in RLS references it.
REVOKE ALL ON FUNCTION public.org_plan(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.org_plan(uuid) TO service_role;

-- handle_new_user() is a trigger function; it must never be callable directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- enforce_synthetic_flag() is a trigger function only.
REVOKE ALL ON FUNCTION public.enforce_synthetic_flag() FROM anon, authenticated, public;

-- NOTE: has_org_role / is_org_manager / is_org_member remain EXECUTE-able by
-- authenticated ON PURPOSE. Every RLS policy in this schema calls them, and
-- policy evaluation happens as the calling role — revoking EXECUTE would make
-- every members-only SELECT fail. They are SECURITY DEFINER with a pinned
-- search_path and read nothing beyond the caller's own membership rows.
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_org_manager(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;