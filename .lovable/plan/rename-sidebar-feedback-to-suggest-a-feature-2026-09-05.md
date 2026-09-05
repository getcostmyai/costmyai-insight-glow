# Rename sidebar "Feedback" to "Suggest a feature"

## What
Change the label of the bottom account-nav item in the signed-in sidebar from "Feedback" to "Suggest a feature". The route, icon (`MessageSquarePlus`), and URL (`/feedback`) stay the same; only the visible label changes.

## Why
"Suggest a feature" reads as an intentional invitation and better matches the new in-product feedback board's purpose.

## Files to change
- `src/components/dashboard/DashboardSidebar.tsx`
  - Update `accountNav` entry: `label: "Suggest a feature"` (was `"Feedback"`).

## Verification
- Visual check of the signed-in sidebar shows the new label.
- Existing tests still pass; no route or behavior changes.
