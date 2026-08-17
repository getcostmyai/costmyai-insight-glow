-- Dispatch 230: retire the stuck 'running' rows left by unbounded upstream reads.
-- These runs never finished and never will; leaving them as 'running' corrupts
-- staleness/failure detection over the sync ledger's history.
UPDATE public.pricing_snapshots
SET status = 'timed_out',
    finished_at = COALESCE(finished_at, synced_at + interval '3 minutes'),
    error_detail = COALESCE(error_detail,
      'retroactively closed (dispatch 230): run hung with no upstream timeout and never recorded a verdict')
WHERE status = 'running'
  AND finished_at IS NULL
  AND synced_at < now() - interval '10 minutes';