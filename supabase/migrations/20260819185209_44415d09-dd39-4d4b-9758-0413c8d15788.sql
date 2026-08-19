ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS task_confidence numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classifier_revision smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.usage_events.task_confidence IS
  'Dispatch 234. 0..1 confidence in task_hint. Coherent by contract: 0 for unknown, >0 otherwise. 0 for every pre-234 event.';
COMMENT ON COLUMN public.usage_events.classifier_revision IS
  'Dispatch 234. Revision of the local classifier that produced task_hint, versioned independently of the container image tag. 0 = no local classifier ran.';

ALTER TABLE public.usage_rollups
  ADD COLUMN IF NOT EXISTS task_confidence_mean numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classifier_revision_min smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.usage_rollups.task_confidence_mean IS
  'Dispatch 234. Requests-weighted mean task_confidence of the events in the bucket. Metadata, not part of the grouping key.';
COMMENT ON COLUMN public.usage_rollups.classifier_revision_min IS
  'Dispatch 234. LOWEST classifier revision contributing to the bucket: a bucket is only as trustworthy as its weakest contributor.';