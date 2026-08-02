CREATE OR REPLACE FUNCTION public.price_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'price_history is append-only and permanent — rows cannot be deleted, pruned, rotated or archived'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RAISE EXCEPTION 'price_history is append-only — an observed price row cannot be edited; insert a new observation instead'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

DROP TRIGGER IF EXISTS price_history_append_only ON public.price_history;

CREATE TRIGGER price_history_append_only
BEFORE UPDATE OR DELETE ON public.price_history
FOR EACH ROW EXECUTE FUNCTION public.price_history_append_only();