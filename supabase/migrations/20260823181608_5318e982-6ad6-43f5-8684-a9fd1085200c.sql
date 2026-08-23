-- Dispatch: the token-drift meter had a route, a registry entry and a job name,
-- but no cron entry — so it never ran. Monthly, on the schedule the registry documents.
select cron.schedule(
  'costmyai-task-drift',
  '30 2 1 * *',
  $$
  select net.http_post(
    url := 'https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4.lovable.app/api/public/sync/task-drift',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select value from public.job_config where key = 'sync_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- The alert sweep ran every 13 minutes while the registry documented every 15.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'costmyai-job-alerts'),
  schedule := '*/15 * * * *'
);