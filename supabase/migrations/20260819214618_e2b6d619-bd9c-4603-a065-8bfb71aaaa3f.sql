SET lock_timeout = '3s';

-- Dispatch 238. usage_events.route_reason is the only evidence that a switch
-- actually moved traffic, and it is what saved_usd is credited from. Until now
-- nothing stopped it naming a switch that does not exist.
--
-- NOT VALID: the constraint is enforced for every new and updated row from this
-- statement onward, and the 4.4M existing rows are verified by a separate
-- VALIDATE CONSTRAINT migration so this one takes only a brief catalog lock.
--
-- ON DELETE NO ACTION, stated explicitly: deleting a switch that events still
-- reference is refused. ON DELETE SET NULL was rejected deliberately — it would
-- erase the reroute provenance that credited savings are computed from, and the
-- loss would be silent and unrecoverable.
--
-- SCOPE CAVEAT: this constraint proves the referenced switch EXISTS. It does NOT
-- prove the switch belongs to the same organisation as the event. Cross-tenant
-- attribution is still enforced in application code
-- (src/lib/switching/savings.server.ts, which joins on org_id); do not read this
-- FK as covering tenancy.
ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_route_reason_fkey
  FOREIGN KEY (route_reason) REFERENCES public.switches(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION
  NOT VALID;