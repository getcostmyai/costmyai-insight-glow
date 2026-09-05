CREATE OR REPLACE FUNCTION public.feedback_posts_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if new.status is distinct from old.status and not public.is_platform_admin() then
    raise exception 'Only the CostMyAI team can change a suggestion status';
  end if;
  return new;
end
$$;