# Compare rung visibility — verified, no change

## Decision
Leave the sidebar rule as is (user confirmed). No code change.

## Verified facts
- `src/components/dashboard/DashboardSidebar.tsx` filters levels with `planAtLeast(meta.requiredPlan, plan)`: a customer sees their own rung plus every rung above it (locked). Rungs below are hidden; their findings are merged inline into the customer's current rung (Dispatch 232/172).
- The user's workspace is on the Certify plan, so Compare is intentionally not listed. `/workspace/compare` still exists as a real route.
- Demo scope bypasses the filter entirely (`scope === "demo" ? LEVELS : ...`), so the demo shows the full ladder: Overview, Compare, Certify, Rightsize, Govern.

## Work items
None. Behavior confirmed correct as designed.
