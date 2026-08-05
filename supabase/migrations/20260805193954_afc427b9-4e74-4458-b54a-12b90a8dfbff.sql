-- Dispatch 112. Every shape-watch alert on the board was raised by the
-- integration suite: a fixture feed declaring `cohere` a brand-new provider,
-- and events carrying test-only model keys. Real alerts are left alone; going
-- forward the isolation sweep removes these by stamp instead of by name.
DELETE FROM public.sync_runs
WHERE job = 'shape-watch'
  AND (
    detail->'pairs' ?| array[
      'no-such-model-at-all@ai.gateway.lovable.dev',
      'kwaipilot/kat-coder-pro-v2.5@openrouter'
    ]
    OR detail->'providers' @> '[{"host":"cohere"}]'::jsonb
  );