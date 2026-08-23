-- The rate-limit sweeper was a real cron nobody had registered, so its failure
-- would have been invisible. It now reports to the same ledger every other job
-- writes to, which is what makes a registry entry meaningful.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'costmyai-rate-limit-gc'),
  command := $$
  insert into public.sync_runs (job, started_at, finished_at, ok, outcome, rows_written)
  select 'rate-limit-gc', now(), now(), true,
         case when pruned > 0 then 'ok' else 'quiet' end, pruned
  from (select public.rate_limit_gc(86400) as pruned) s;
  $$
);