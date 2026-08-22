REVOKE EXECUTE ON FUNCTION public.partner_badge(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_badge(text) TO service_role;