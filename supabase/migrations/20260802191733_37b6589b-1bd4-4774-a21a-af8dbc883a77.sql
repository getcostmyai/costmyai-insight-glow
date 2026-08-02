ALTER TABLE public.backup_export_runs
  ADD COLUMN IF NOT EXISTS target_row_counts jsonb,
  ADD COLUMN IF NOT EXISTS triggers_ok boolean,
  ADD COLUMN IF NOT EXISTS statements integer,
  ADD COLUMN IF NOT EXISTS counts_match boolean;

COMMENT ON TABLE public.backup_export_runs IS
  'Audit log of off-platform disaster-recovery restores into the independent Neon project (costmyai-dr-backup). destination holds the Neon host, row_counts the source counts, target_row_counts the counts read back from the restored copy.';