-- First real sweep under the new command, so the board reflects an executed run
-- rather than waiting an hour to prove the wiring.
insert into public.sync_runs (job, started_at, finished_at, ok, outcome, rows_written)
select 'rate-limit-gc', now(), now(), true,
       case when pruned > 0 then 'ok' else 'quiet' end, pruned
from (select public.rate_limit_gc(86400) as pruned) s;