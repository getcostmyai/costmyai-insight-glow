CREATE TABLE public.monthly_kpi_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  payload jsonb NOT NULL,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES public.monthly_kpi_snapshot(id),
  superseded_at timestamptz,
  note text
);

CREATE UNIQUE INDEX monthly_kpi_snapshot_month_original
  ON public.monthly_kpi_snapshot (month)
  WHERE supersedes_id IS NULL;

CREATE INDEX monthly_kpi_snapshot_month_idx ON public.monthly_kpi_snapshot (month DESC, frozen_at DESC);

GRANT SELECT ON public.monthly_kpi_snapshot TO anon;
GRANT SELECT ON public.monthly_kpi_snapshot TO authenticated;
GRANT ALL ON public.monthly_kpi_snapshot TO service_role;

ALTER TABLE public.monthly_kpi_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Frozen monthly figures are public"
  ON public.monthly_kpi_snapshot FOR SELECT
  USING (true);

-- A frozen figure is a citation target. It may never be rewritten: the only
-- permitted mutation is stamping superseded_at once, when a restatement row
-- referencing it is filed. Everything else raises.
CREATE OR REPLACE FUNCTION public.monthly_kpi_snapshot_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'frozen monthly figures are permanent — file a restatement row instead'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.month IS DISTINCT FROM OLD.month
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
     OR NEW.note IS DISTINCT FROM OLD.note THEN
    RAISE EXCEPTION 'a frozen month cannot be edited — insert a new row with supersedes_id set to %', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'this row was already restated' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER monthly_kpi_snapshot_append_only
BEFORE UPDATE OR DELETE ON public.monthly_kpi_snapshot
FOR EACH ROW EXECUTE FUNCTION public.monthly_kpi_snapshot_append_only();