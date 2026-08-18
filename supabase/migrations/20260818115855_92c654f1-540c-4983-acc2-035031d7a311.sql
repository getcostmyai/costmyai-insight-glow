select cron.schedule(
  'costmyai-rollup-health',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4-dev.lovable.app/api/public/sync/rollup-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select value from public.job_config where key = 'sync_cron_secret')
    ),
    body := '{"repair": true}'::jsonb
  ) as request_id;
  $$
);