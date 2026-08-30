-- Verdict-delta anti-thrash guard schema (Leveson, Phase 1 design; not
-- previously implemented — confirmed absent from every prior migration and
-- from every reference in application code as of 2026-08-30).
--
-- Scope, exactly as specced and no further: the dwell-time guard and the
-- flip-count guard need no schema (they already read switch_events history
-- and rolled_back events respectively). Only the verdict-delta guard needs
-- new storage, and only two columns' worth:
--
--   verdict           the routing verdict in force at the moment this
--                      switch_events row was written (e.g. the Rightsize/
--                      Govern outcome), so a later guard can compare "what we
--                      decided then" against "what we would decide now"
--                      without re-deriving history from unrelated tables.
--   separation_score   the numeric margin behind that verdict at write time,
--                      for the same reason — a guard against thrash needs to
--                      know how CLOSE a decision was, not just what it was.
--
-- Both are NULLABLE and ADDITIVE:
--   - No existing row gets a value (backfill is explicitly out of scope; a
--     verdict/separation_score computed after the fact for a historic switch
--     event is a guess, not a record, and this schema exists to stop guessing
--     at decision quality).
--   - No existing query, view or RLS policy on switch_events changes shape.
--   - Nothing here writes a `reaffirmed_autonomous` event. That event type
--     needs no schema of its own: `switch_events.event` is already free text
--     (see the original CREATE TABLE, 20260730130300), so the routing engine
--     can start writing that value the moment it has real decision-moment
--     logic to drive it. Deciding WHEN a reaffirmed_autonomous event is
--     correct to write, and what verdict/separation_score value belongs next
--     to it, is Leveson's routing-rule call, not a schema question — this
--     migration only makes the two columns exist to receive that write.
ALTER TABLE public.switch_events
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS separation_score numeric;

COMMENT ON COLUMN public.switch_events.verdict IS
  'Routing verdict in force when this event was recorded. NULL for every event predating this column and for any event type the verdict-delta guard does not need (e.g. plain activation/rollback rows written before a routing decision was re-evaluated). Populated going forward only by the routing engine that owns verdict semantics.';
COMMENT ON COLUMN public.switch_events.separation_score IS
  'Numeric margin behind `verdict` at write time. NULL under the same rule as `verdict`. Population and interpretation owned by the routing engine (Leveson), not by this schema.';