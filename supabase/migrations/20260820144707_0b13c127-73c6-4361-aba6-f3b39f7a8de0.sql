-- Recommendations rows are computed for every workspace regardless of plan.
-- The SELECT policy only checked membership, so any member could read
-- higher-tier findings their workspace does not pay for. Gate each row on its
-- own min_plan against the workspace's entitled plan rank. org_entitled_to()
-- already generalizes to all four plan_tier values: plan_rank(_required) = 0
-- (compare) short-circuits to true, and every other value is compared by rank
-- against both the organizations.plan rank and a live subscription's plan rank,
-- which gives downward inheritance for free.
DROP POLICY IF EXISTS "members read recs" ON public.recommendations;

CREATE POLICY "members read recs"
ON public.recommendations
FOR SELECT
TO authenticated
USING (
  public.is_org_member(org_id)
  AND is_synthetic = public.org_is_synthetic(org_id)
  AND public.org_entitled_to(org_id, min_plan)
);