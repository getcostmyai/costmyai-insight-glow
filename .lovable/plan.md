# Partner Journey — Audit Plan

Pre-plan checks already ran against the live database and the real code. Four findings are confirmed now, before any work starts. The rest of the audit is what this plan proposes.

## Confirmed before planning

- **`partners`: 0 rows. `partner_users`: 0 rows. `commission_ledger`: 0 rows.** Nothing real exists downstream of the application form.
- **Approval does nothing.** `setApplicationStatus` only writes `status`, `reviewer_note`, `reviewed_by`, `reviewed_at` on `partner_applications`. No code anywhere inserts a `partners` row or a `partner_users` row — the only non-test reads of `partners` are the referral redirect and the partner dashboard. So today, "approved" is a label with no side effects, and creating a real partner takes the same hand-built construction Dispatch 129 did for its test.
- **`partner_users` has no insert policy at all** (SELECT only). Even a platform admin cannot add an owner to a partner account through the app — only a migration or service-role script can. That is the hard blocker on self-serve onboarding.
- **The one "pending application" is not real.** It is a leftover integration-test row: `Integration Test GmbH`, `slack-test-1785541603@integration-test.invalid`, created 2026-07-31, never reviewed. So the application form has never been used by a real person either.

Stripe Connect onboarding itself *is* self-serve (`startConnectOnboarding` creates a real account link, gated by `is_partner_owner`) — but it is unreachable until a `partners` + `partner_users` pair exists, which nothing can create.

## What the audit will do

**Stage 0 — Attraction.** Read the live `/partners` page end to end, capture real screenshots, and record what the value proposition actually rests on: the five-tier ladder read live from `partner_tiers` (15/20/25/30/35% at $0/$5K/$10K/$40K/$130K), three promises, three steps. Check discoverability (nav, footer, sitemap entry at priority 0.7) and confirm no fabricated testimonial, logo, or case study is standing in as a trust marker.

**Stage 1 — Application.** Submit a real application through the live form, confirm the row lands with the correct routing decision, confirm what the applicant sees afterwards, and confirm whether the reviewer alert actually fires to the configured webhook (the secret is set — the audit checks it delivers, not that it is configured). Then try to act on the existing test row through `/admin/partner-applications` and record exactly what happens. Delete the test row afterwards.

**Stage 2 — Approval to real partner.** Already answered above. The audit writes it up with the file:line evidence and enumerates precisely what a human must do by hand per partner: pick a referral code, insert the `partners` row, insert the `partner_users` owner row, tell the person to sign in, then let them run Connect onboarding.

**Stage 3 — Partner dashboard, mirror-audit style.** Every element on `/partner`: what is displayed, real screenshot, real source, and whether the number is computed in the database (`partner_summary`, `partner_commission_rate`, `partner_effective_tier`, `partner_lifetime_revenue`) or duplicated in app code. Then a real end-to-end referral test: create a partner, click `/r/CODE`, sign up a workspace, and confirm the attribution shows in that partner's own dashboard and nowhere else.

**Stage 4 — Lifecycle.** Confirm tier progression is computed from real referred revenue with no second copy of the ladder in app code, confirm the payout run (proven in Dispatch 129) reads the same ledger the webhook writes, and inventory partner-facing notifications — expected finding: none exist for tier changes, new referrals, or payouts sent.

All audit fixtures are created and removed within the run, same isolation discipline as the previous audits.

## Marketing deliverable (separate from the audit)

A distinct written recommendation on attraction levers beyond commission — co-marketing and case-study exposure, early feature access, a public partner directory or verifiable badge, a direct product-feedback channel, tier recognition that is not only money, network effects between partners, and what the page should say when there are still zero named partners to point at. Recommendation only; nothing gets built from it in this pass.

## Technical notes

Read-only except for the audit fixtures described above. No production schema or code changes are made during the audit. The Stage 2 remedy — an approve action that provisions a partner, generates a referral code, and grants owner membership, which needs a migration for the missing `partner_users` insert path — is scoped as a follow-up, not part of this run.

## Decision needed

Stage 2's answer is already in hand: partner creation is fully manual and partly impossible through the app. Vincent is the one real case waiting. Choose one:

1. **Audit first, then build the pipeline** — Vincent gets hand-provisioned in the meantime.
2. **Build the approval pipeline first** — Vincent becomes its first real run, audit follows.
