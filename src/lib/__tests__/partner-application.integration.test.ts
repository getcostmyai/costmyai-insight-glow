/**
 * Proves the review queue is real storage, not a form that emails into the void,
 * and that the personal contact details it holds are unreadable to the public.
 * Real database, real RLS, no mocks.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { routeApplication } from "@/lib/partner-application";
import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

function anonClient() {
  return createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (PUBLISHABLE.startsWith("sb_") && headers.get("Authorization") === `Bearer ${PUBLISHABLE}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", PUBLISHABLE);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Fixtures never persist in the customer database — see support/isolation.ts.
guardIntegrationDatabase(admin);

const email = `test-${Date.now()}@integration-test.invalid`;
const created: string[] = [];

afterAll(async () => {
  if (created.length) await admin.from("partner_applications").delete().in("id", created);
});

describe("partner_applications storage", () => {
  it("persists an application with its answers and routed path", async () => {
    const routing = routeApplication("11–50", "3+");
    const { data, error } = await admin
      .from("partner_applications")
      .insert({
        first_name: "Test",
        last_name: "Applicant",
        email,
        phone: "+43 660 0000000",
        company: "Integration Test GmbH",
        active_clients_bucket: "11–50",
        starting_soon_bucket: "3+",
        routed_path: routing.path,
        escalated: routing.escalated,
      })
      .select("id, status, routed_path, escalated, created_at")
      .single();

    expect(error).toBeNull();
    created.push(data!.id);
    // Strong near-term pipeline escalated a mid-size practice to a meeting.
    expect(data!.routed_path).toBe("meeting");
    expect(data!.escalated).toBe(true);
    // Nothing is auto-approved: a human still has to act on it.
    expect(data!.status).toBe("pending");
  });

  it("refuses anonymous reads of applicant contact details", async () => {
    const { data, error } = await anonClient()
      .from("partner_applications")
      .select("email, phone");
    // Either an outright error or an empty set — never a row of personal data.
    expect(error ?? data).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses anonymous inserts — submissions go through the server only", async () => {
    const { error } = await anonClient()
      .from("partner_applications")
      .insert({
        first_name: "Anon",
        last_name: "Attempt",
        email: `anon-${Date.now()}@integration-test.invalid`,
        phone: "+43 660 0000000",
        company: "Anon",
        active_clients_bucket: "0",
        starting_soon_bucket: "0",
        routed_path: "async",
      });
    expect(error).not.toBeNull();
  });
});
