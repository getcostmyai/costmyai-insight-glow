# In-product feedback board ("Suggest a feature")

A Featurebase-style board, built into CostMyAI, for signed-in customers only. Posting, upvoting, comments, and a status from you (planned / building / shipped). No third-party service, no monthly fee, matching the product's design language.

## Why this shape

- Customers-only keeps signal high and avoids a public empty forum. Every post gets a personal reply, which doubles as churn defense.
- Built into the app: customer data never leaves to a third party, design matches, and it becomes part of the product rather than an embedded widget on an external domain.
- A public read-only roadmap page is deliberately NOT in scope now. It becomes a one-line flip later once the board has content.

## Schema (one migration)

Three tables in `public`, each followed by GRANTs, RLS enabled, then policies:

- `feedback_posts`: id, author_id (references auth.users via profiles pattern), title (max 120 chars), body (max 2000), category (enum: feature, improvement, bug, integration), status (enum: open, planned, building, shipped, declined — default open, writable only by platform admin), created_at, updated_at.
- `feedback_votes`: post_id + user_id, unique pair (one vote per user per post), insert/delete only.
- `feedback_comments`: id, post_id, author_id, body (max 1000), created_at. Plus an `is_admin_reply` flag set server-side from `has_role`, never client-writable.

Policies: any authenticated user can SELECT all posts/votes/comments; INSERT scoped to `auth.uid()`; UPDATE/DELETE only own rows (and only while status is open, for posts); only admins can change `status` via a security-definer function `set_feedback_status(post_id, status)` guarded by `public.has_role(auth.uid(), 'admin')`. Vote counting is a view or computed count, not a writable column, so counts can never be gamed.

## App surfaces

1. **`/feedback` route** under `_authenticated/`, added to the dashboard sidebar ("Feedback"). Board list: search box, category filter, sort by votes or newest, each row shows title, vote count, status chip, comment count. "New suggestion" opens a form (client + server validation via zod).
2. **Post detail** at `/feedback/$id`: full body, upvote button (optimistic, one vote per user), comment thread, and an admin-only status control for you.
3. **Admin**: status changes live on the post detail page itself (no separate admin screen needed yet); optionally surfaced in the admin command center later.
4. **Entry points**: sidebar nav item plus a small "Suggest a feature" link in the workspace header.

## Server functions (`src/lib/feedback.functions.ts` + `feedback.server.ts`)

`listFeedbackPosts`, `getFeedbackPost`, `createFeedbackPost`, `toggleFeedbackVote`, `addFeedbackComment`, `deleteOwnFeedbackComment`, `setFeedbackStatus` (admin-gated). All behind `requireSupabaseAuth`; zod-validated input; rate limit on create-comment/create-post reusing the existing shared Postgres-backed limiter (e.g. 10 posts/day, 60 comments/day per user).

## Notifications (small but important)

When you set a status or reply as admin, the post author gets an email via the existing transactional email path ("Your suggestion is now: Planned"). No notifications to voters in v1.

## Tests

- RLS: user cannot edit another's post or set status; admin function works.
- One vote per user enforced; toggle removes it.
- Server-fn tests for create/vote/comment validation and rate limiting.
- Route renders for a signed-in user (board + detail).

## Explicitly out of scope

Public/anonymous access, email digests, markdown in comments, attachments, admin analytics on feedback. Each is a later decision.

## Technical notes

- Reuses: `requireSupabaseAuth`, `has_role`, the shared rate limiter (`mem://features/rate-limiting`), the transactional email sender, `AccountShell`/dashboard chrome for layout, existing design tokens (no hardcoded colors).
- Route files: `src/routes/_authenticated/feedback.index.tsx`, `src/routes/_authenticated/feedback.$id.tsx`. Sidebar key added in `DashboardSidebar.tsx`.
- Migration order per standing rules: CREATE TABLE → GRANT → ENABLE RLS → POLICIES, all in one migration; no FK to `auth.users` beyond the established profiles pattern.
