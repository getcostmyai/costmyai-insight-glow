/**
 * Dispatch: real end-to-end drill of the partner-apply pipeline.
 *
 * Runs the actual `submitPartnerApplication` server function — validator, rate
 * limiter, dedup branch, service-role write and `notifyReviewers` — not a
 * direct admin insert around it. The only thing substituted is the webhook
 * *destination*: `PARTNER_ALERT_WEBHOOK_URL` is repointed, for this test
 * process only, at a local catcher so the drill proves the notify path fires
 * for real without posting test data into the production reviewer channel. The
 * stored project secret is never modified.
 *
 * The server function reads the caller IP through `getRequest()`, so each call
 * runs inside a real TanStack request context with a synthetic client IP; that
 * IP is what the shared Postgres limiter keys on.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createClient } from "@supabase/supabase-js";
import { requestHandler } from "@tanstack/start-server-core";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { submitPartnerApplication } from "@/lib/partner-application.functions";
import type { ApplicationInput } from "@/lib/partner-application";
import { guardIntegrationDatabase } from "./support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

const admin = createClient(URL_, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

const stamp = Date.now();
const EMAIL = `partner-apply-drill-${stamp}@costmyai-test.dev`;
/** Unique per run, so the hourly limiter budget is this drill's alone. */
const CALLER_IP = `203.0.113.${stamp % 200}`;

interface Caught {
  text: string;
  application: { id: string; email: string; path: string; escalated: boolean };
}

let catcher: Server;
let caught: Caught[] = [];
let previousWebhook: string | undefined;

beforeAll(async () => {
  catcher = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      caught.push(JSON.parse(body) as Caught);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => catcher.listen(0, "127.0.0.1", resolve));
  const port = (catcher.address() as AddressInfo).port;

  previousWebhook = process.env["PARTNER_ALERT_WEBHOOK_URL"];
  process.env["PARTNER_ALERT_WEBHOOK_URL"] = `http://127.0.0.1:${port}/reviewer-alert`;
});

afterAll(async () => {
  if (previousWebhook === undefined) delete process.env["PARTNER_ALERT_WEBHOOK_URL"];
  else process.env["PARTNER_ALERT_WEBHOOK_URL"] = previousWebhook;
  await new Promise<void>((resolve) => catcher.close(() => resolve()));

  await admin.from("partner_applications").delete().eq("email", EMAIL);
});

/** Invoke the server function exactly as the published site does: inside a request. */
async function submit(input: ApplicationInput) {
  const handler = requestHandler(async () =>
    runWithStartContext({ contextAfterGlobalMiddlewares: {} } as never, async () => {
      try {
        return Response.json({ ok: true, result: await submitPartnerApplication({ data: input }) });
      } catch (error) {
        return Response.json({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
  const response = await handler(
    new Request("https://costmyai.com/partners/apply", {
      method: "POST",
      headers: { "cf-connecting-ip": CALLER_IP, origin: "https://costmyai.com" },
    }),
    {} as never,
  );
  return (await (response as Response).json()) as
    | { ok: true; result: { id: string; path: "meeting" | "async"; escalated: boolean } }
    | { ok: false; message: string };
}

const base: ApplicationInput = {
  firstName: "Drill",
  lastName: "Applicant",
  email: EMAIL,
  phone: "+43 660 1234567",
  company: "TEST DATA — partner apply drill (delete)",
  // 101–300 active clients is at-scale, so this routes to the meeting path.
  activeClients: "101–300",
  startingSoon: "3+",
};

describe("partner-apply pipeline, end to end", () => {
  let firstId = "";

  it("STEP 1 — first submission passes the limiter, writes a row and fires the webhook", async () => {
    const result = await submit(base);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    firstId = result.result.id;
    expect(result.result.path).toBe("meeting");

    const { data } = await admin
      .from("partner_applications")
      .select("id, email, company, routed_path, escalated, status, notified_at, notify_error")
      .eq("id", firstId)
      .single();
    expect(data?.email).toBe(EMAIL);
    expect(data?.routed_path).toBe("meeting");
    expect(data?.status).toBe("pending");
    // Real proof the alert left the process and was accepted by the endpoint.
    expect(data?.notify_error).toBeNull();
    expect(data?.notified_at).not.toBeNull();

    expect(caught).toHaveLength(1);
    expect(caught[0]?.application.id).toBe(firstId);
    expect(caught[0]?.text).toContain("New partner application");
  }, 60_000);

  it("STEP 2 — a re-submit on the same email updates the open row instead of duplicating it", async () => {
    const result = await submit({ ...base, company: "TEST DATA — drill, corrected name (delete)" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    expect(result.result.id).toBe(firstId);

    const { data } = await admin
      .from("partner_applications")
      .select("id, company")
      .eq("email", EMAIL);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.company).toBe("TEST DATA — drill, corrected name (delete)");
    expect(caught).toHaveLength(2);
  }, 60_000);

  it("STEP 3 — the limiter refuses the fourth attempt from the same caller", async () => {
    // Rule is 3 per hour per IP; two are already spent.
    const third = await submit(base);
    expect(third.ok).toBe(true);

    const fourth = await submit(base);
    expect(fourth.ok).toBe(false);
    if (fourth.ok) return;
    expect(fourth.message).toMatch(/Too many requests/);

    // A refused call must not write, and must not alert.
    expect(caught).toHaveLength(3);
    const { data } = await admin.from("partner_applications").select("id").eq("email", EMAIL);
    expect(data).toHaveLength(1);
  }, 60_000);

  it("STEP 4 — the meeting route is what the done screen keys its booking link off", async () => {
    const { data } = await admin
      .from("partner_applications")
      .select("routed_path, escalated")
      .eq("email", EMAIL)
      .single();
    expect(data?.routed_path).toBe("meeting");

    // Documented gap, asserted rather than assumed: nothing on the row can ever
    // carry a booking. There is no column for a HubSpot meeting, and no code
    // path writes one back, so a completed booking is never associated with the
    // application record it came from.
    const { data: columns } = await admin
      .from("partner_applications")
      .select("*")
      .eq("email", EMAIL)
      .single();
    expect(Object.keys(columns ?? {}).some((c) => /meet|booking|hubspot|calendar/i.test(c))).toBe(
      false,
    );
  }, 60_000);

  it("STEP 5 — cleanup leaves no drill rows behind", async () => {
    await admin.from("partner_applications").delete().eq("email", EMAIL);
    const { data } = await admin.from("partner_applications").select("id").eq("email", EMAIL);
    expect(data).toHaveLength(0);
  }, 60_000);
});
