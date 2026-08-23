import type { PlanTier } from "@/lib/engine/types";

/**
 * The customer directory — types and the one judgement call it makes.
 *
 * Read-only by construction: nothing in this module writes, and the page built
 * on it offers no action on a customer account. There is no admin write-path
 * to a workspace today (paid levels come from the signed payment webhook, and
 * `set_org_plan` is owner-only and refuses anything above Compare), so a
 * directory that appeared to offer one would be lying.
 */

/** Domains used by the test harness and by internal drills. Never customers. */
export const TEST_EMAIL_DOMAINS = [
  "costmyai-test.com",
  "costmyai-test.dev",
  //TEMPVERIFY "costmyai.dev",
] as const;

/** The founder account. Shown, but never presented as an anonymous customer. */
export const INTERNAL_EMAILS = ["mail@costmyai.com"] as const;

export type DirectoryVerdict = "customer" | "internal" | "test_harness" | "no_contact";

/**
 * Why a workspace is, or is not, in the directory.
 *
 * A workspace whose creator no longer exists in auth has no contact at all —
 * that is test teardown residue, not a customer with a missing email, and it
 * is excluded rather than rendered as an anonymous row.
 */
export function classifyOrg(email: string | null): DirectoryVerdict {
  if (!email) return "no_contact";
  const lower = email.trim().toLowerCase();
  if ((INTERNAL_EMAILS as readonly string[]).includes(lower)) return "internal";
  const domain = lower.split("@")[1] ?? "";
  if ((TEST_EMAIL_DOMAINS as readonly string[]).includes(domain)) return "test_harness";
  return "customer";
}

export interface FunnelTouch {
  eventType: string;
  at: string;
}

export interface CustomerRow {
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
  email: string;
  fullName: string | null;
  /** True for the founder account: labelled, not hidden. */
  internal: boolean;
  seats: number;
  /** The level the workspace may actually use, resolved like every other gate. */
  effectivePlan: PlanTier;
  /** What `organizations.plan` says. Shown only when it disagrees with the above. */
  recordedPlan: PlanTier;
  /** The live-environment subscription behind the resolved level, if any. */
  subscription: { plan: PlanTier; status: string; currentPeriodEnd: string | null } | null;
  /** A subscription that exists only in the other payment environment. */
  otherEnvSubscription: { environment: string; plan: PlanTier; status: string } | null;
  spend30dUsd: number;
  spendLifetimeUsd: number;
  lastActivityAt: string | null;
  /** Null when the signup carried no visitor cookie — rendered as "No funnel data". */
  firstVisitorId: string | null;
  funnel: FunnelTouch[];
  partner: { id: string; name: string; code: string } | null;
  referredAt: string | null;
}

export interface CustomerDirectory {
  environment: string;
  rows: CustomerRow[];
  excluded: {
    synthetic: number;
    testHarness: number;
    noContact: number;
  };
  readAt: string;
}
