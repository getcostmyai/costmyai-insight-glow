-- Keep the OG renderer warm.
--
-- A cold renderer instance fetches its fonts before it can rasterise anything,
-- and that first slow request is what made LinkedIn shares show "No image
-- found". Pinging the live OG endpoint every three minutes (the cadence
-- pricing-sync already runs at) keeps an instance in memory most of the time.
--
-- This reduces how often a cold start happens. It is NOT a substitute for the
-- two real fixes: the 4s abort on the renderer fetch, and the static PNG
-- fallback that replaced the unparseable SVG fallback. Those must stay in place
-- whether or not this job is running.
--
-- No auth header: /api/public/og/* is deliberately unauthenticated so social
-- crawlers can fetch it. GET, not POST: the route only implements GET.
select cron.unschedule('costmyai-og-keepwarm')
where exists (select 1 from cron.job where jobname = 'costmyai-og-keepwarm');

select cron.schedule(
  'costmyai-og-keepwarm',
  '*/3 * * * *',
  $$
  select net.http_get(
    url := 'https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4-dev.lovable.app/api/public/og/intelligence/live?card=kpi-moves'
  ) as request_id;
  $$
);