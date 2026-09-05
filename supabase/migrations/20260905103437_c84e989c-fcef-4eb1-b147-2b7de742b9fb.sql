CREATE OR REPLACE FUNCTION public.feedback_comments_set_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_admin_reply := public.is_platform_admin();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_feedback_status(_post_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: platform admins only';
  END IF;
  IF _status NOT IN ('open','planned','building','shipped','declined') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.feedback_posts
     SET status = _status,
         updated_at = now()
   WHERE id = _post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_feedback_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_feedback_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_feedback_status(uuid, text) TO service_role;