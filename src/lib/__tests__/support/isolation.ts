import { afterAll, beforeAll } from "vitest";

/**
 * Why this file exists.
 *
 * Three orgs called "Switch Free/Paid/Outsider <timestamp>" — plus a sandbox
 * subscription and three activated recommendations — were found sitting in the
 * production database on launch weekend. They were created by an integration
 * run whose `afterAll` never got to clean up, and nothing in the suite noticed
 * or complained. Test fixtures in the customer database are not a tidiness
 * problem: they inflate "how many real customers do we have", they carry plan
 * rows, and they are indistinguishable from real accounts a week later.
 *
 * There is no second Supabase project to point the integration suite at, so
 * the honest fix is not pretending there is one. Instead: every integration
 * file must call `guardIntegrationDatabase(admin)`, which sweeps known test
 * residue *before* the file runs and again *after* it, and fails the run if
 * anything the suite created is still there. Cleanup stops depending on a
 * happy path completing. A standing audit check
 * (`bun run audit:tests`) proves no integration file skips it.
 *
 * If a dedicated test project ever exists, set COSTMYAI_TEST_DB_ISOLATED=1 and
 * the sweep becomes a no-op safety net rather than the mechanism.
 */

/** Every account the integration suite creates uses this domain. Nothing else does. */
export const TEST_EMAIL_DOMAIN = "costmyai-test.dev";

/**
 * Test workspaces are named `<something> <Date.now()>`. A real customer is not
 * going to end a workspace name with a 13-digit epoch.
 */
const TEST_ORG_NAME = /\s1[0-9]{12}$/;

interface AdminLike {
  auth: {
    admin: {
      listUsers: (opts: { page: number; perPage: number }) => Promise<{
        data: { users: Array<{ id: string; email?: string | null; created_at?: string }> };
        error: unknown;
      }>;
      deleteUser: (id: string) => Promise<{ error: unknown }>;
    };
  };
  from: (table: string) => any;
}

export interface SweepResult {
  users: number;
  organizations: number;
  partnerApplications: number;
  partners: number;
}

export const totalResidue = (r: SweepResult) =>
  r.users + r.organizations + r.partnerApplications + r.partners;

/**
 * Remove everything the integration suite is capable of leaving behind, and
 * report what it removed. Safe to call when there is nothing to do.
 */
export async function sweepTestResidue(
  admin: AdminLike,
  /**
   * Only touch residue older than this. Vitest runs test files in parallel, so
   * an unconditional sweep would delete a sibling file's live fixtures
   * mid-test. Thirty minutes is longer than any file here takes and far
   * shorter than "still in production next week".
   */
  olderThanMs: number = 30 * 60_000,
): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const result: SweepResult = { users: 0, organizations: 0, partnerApplications: 0, partners: 0 };

  // 1. Test accounts, found by their reserved email domain.
  const testUsers: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users as Array<{ id: string; email?: string | null; created_at?: string }>) {
      const stale = !u.created_at || u.created_at < cutoff;
      if (stale && (u.email ?? "").endsWith(`@${TEST_EMAIL_DOMAIN}`)) testUsers.push(u.id);
    }
    if (data.users.length < 1000) break;
  }

  // 2. Their workspaces, plus any workspace whose name carries a test stamp —
  //    a run killed before its org was registered still leaves the name behind.
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, created_by")
    .lt("created_at", cutoff);
  const doomed = (orgs ?? [])
    .filter(
      (o: { id: string; name: string; created_by: string | null }) =>
        TEST_ORG_NAME.test(o.name) || (o.created_by && testUsers.includes(o.created_by)),
    )
    .map((o: { id: string }) => o.id);

  if (doomed.length) {
    // Cascades take switches, recommendations, subscriptions, objectives,
    // routing rules, usage and memberships with them.
    await admin.from("organizations").delete().in("id", doomed);
    result.organizations = doomed.length;
  }

  const like = `%@${TEST_EMAIL_DOMAIN}`;
  const apps = await admin.from("partner_applications").delete().like("email", like).lt("created_at", cutoff).select("id");
  result.partnerApplications = (apps.data ?? []).length;

  const partners = await admin.from("partners").delete().like("contact_email", like).lt("created_at", cutoff).select("id");
  result.partners = (partners.data ?? []).length;

  for (const id of testUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) result.users += 1;
  }

  return result;
}

/**
 * Call once at module scope in every `*.integration.test.ts`, right after the
 * admin client is created. Sweeps before the file and verifies after it.
 */
export function guardIntegrationDatabase(admin: AdminLike): void {
  beforeAll(async () => {
    await sweepTestResidue(admin);
  }, 120_000);

  afterAll(async () => {
    // A second pass with the same age window: harmless while siblings are
    // still running, and it catches anything a long file aged past the cutoff
    // mid-run. Same-run residue is caught by the next run's pre-sweep and by
    // `bun run audit:tests`, which sweeps with a much shorter window.
    const left = await sweepTestResidue(admin);
    if (totalResidue(left) > 0) {
      // Loud on purpose: the previous failure mode was silence.
      console.warn(`[test-isolation] swept stale residue: ${JSON.stringify(left)}`);
    }
  }, 120_000);
}
