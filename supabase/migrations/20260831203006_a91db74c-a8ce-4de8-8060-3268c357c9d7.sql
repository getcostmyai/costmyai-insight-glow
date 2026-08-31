-- Fix: costmyai-og-keepwarm was pinging the dev-preview host
-- (project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4-dev.lovable.app), which is a
-- confirmed separate deployment from production (different x-deployment-id /
-- x-lovable-project-revision header identity, verified live 2026-08-31). That
-- provided zero warmth to the host LinkedIn's crawler and every prior curl
-- check actually hit. Repointing to the real production domain.
select cron.unschedule('costmyai-og-keepwarm')
where exists (select 1 from cron.job where jobname = 'costmyai-og-keepwarm');

select cron.schedule(
  'costmyai-og-keepwarm',
  '*/3 * * * *',
  $$
  select net.http_get(
    url := 'https://www.costmyai.com/api/public/og/intelligence/live?card=kpi-moves'
  ) as request_id;
  $$
);