-- Dispatch 238, step 2. Verify the 4.4M pre-existing rows against the FK added
-- in the previous migration. Measured before running: 83,960 rows carry a
-- route_reason, 0 of them orphaned, so this passes on a single scan.
--
-- Takes ShareUpdateExclusiveLock only: ingest keeps inserting throughout.
-- Kept as its own migration precisely so the scan is never bundled with a
-- statement that needs a stronger lock.
ALTER TABLE public.usage_events VALIDATE CONSTRAINT usage_events_route_reason_fkey;