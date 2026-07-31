REVOKE ALL ON FUNCTION public.block_synthetic_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_synthetic_flag() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;