ALTER TABLE public.billing_reconciliations
  ADD COLUMN supersedes_id uuid REFERENCES public.billing_reconciliations(id) ON DELETE SET NULL,
  ADD COLUMN superseded_at timestamptz;

CREATE INDEX IF NOT EXISTS billing_reconciliations_current_idx
  ON public.billing_reconciliations (capture_id, computed_at DESC)
  WHERE superseded_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_reconciliations_supersedes_unique
  ON public.billing_reconciliations (supersedes_id)
  WHERE supersedes_id IS NOT NULL;