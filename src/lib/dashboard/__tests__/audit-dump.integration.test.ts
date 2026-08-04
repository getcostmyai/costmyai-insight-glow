import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";

import { buildDashboardSnapshot } from "../../dashboard.server";

/**
 * Dispatch 83 audit harness.
 *
 * Not an assertion suite — a dump. It prints every figure the level screens
 * render, straight out of the same snapshot the pages call, so each tile and
 * each row can be traced back to the rollup rows by hand.
 */

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe("audit dump", () => {
  it("prints the 30-day snapshot", async () => {
    const s = (await buildDashboardSnapshot({
      days: 30,
      orgId: DEMO_ORG,
      client: admin as never,
    })) as never as Record<string, unknown>;
    console.log(JSON.stringify(s, null, 1));
  }, 120_000);
});
