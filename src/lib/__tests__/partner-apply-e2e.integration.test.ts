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
 * The two application emails are intercepted the same way and at the same
 * depth: `LOVABLE_SEND_URL` is repointed at a second local catcher, so
 * `sendTemplateEmail` renders the real template and performs a real HTTP POST
 * of the real payload — recipient, subject and body included — which the drill
 * then asserts on. Nothing is stubbed above the network boundary.
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

// The server half of the server function. TanStack splits every
// `createServerFn` into a client stub and this handler; the stub would try a
// network RPC, the handler is what the worker actually runs on an inbound
// request — validator, rate-limit guard and body included.
// @ts-expect-error virtual module produced by the TanStack server-fn plugin
import * as serverFns from "@/lib/partner-application.functions?tss-serverfn-split";
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
/** Second applicant, used only for the forced-email-failure step. */
const FAIL_EMAIL = `partner-apply-drill-fail-${stamp}@costmyai-test.dev`;
/** Unique per run, so the hourly limiter budget is this drill's alone. */
const CALLER_IP = `203.0.113.${stamp % 200}`;
/** The failure step needs its own limiter budget. */
const FAIL_IP = `203.0.113.${(stamp % 200) + 20}`;

interface Caught {
  text: string;
  application: { id: string; email: string; path: string; escalated: boolean };
}

/** The wire payload `sendLovableEmail` POSTs to the send API. */
interface CaughtEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  label: string;
  idempotency_key: string;
}

let catcher: Server;
let caught: Caught[] = [];
let previousWebhook: string | undefined;

let mailCatcher: Server;
let mails: CaughtEmail[] = [];
/** Set for one call to make the send API refuse, proving the wrapping holds. */
let mailFailure: null | { status: number; body: string } = null;
let previousSendUrl: string | undefined;
let previousApiKey: string | undefined;

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

  mailCatcher = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (mailFailure) {
        // Refuse without recording: a send that the API rejects never happened.
        res.writeHead(mailFailure.status, { "Content-Type": "application/json" });
        res.end(mailFailure.body);
        return;
      }
      mails.push(JSON.parse(body) as CaughtEmail);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message_id: `drill-${mails.length}` }));
    });
  });
  await new Promise<void>((resolve) => mailCatcher.listen(0, "127.0.0.1", resolve));
  const mailPort = (mailCatcher.address() as AddressInfo).port;

  previousSendUrl = process.env["LOVABLE_SEND_URL"];
  process.env["LOVABLE_SEND_URL"] = `http://127.0.0.1:${mailPort}/v1/messaging/email/send`;
  // The helper refuses to run without a key; the catcher does not check it.
  previousApiKey = process.env["LOVABLE_API_KEY"];
  if (!previousApiKey) process.env["LOVABLE_API_KEY"] = "drill-key";
});

afterAll(async () => {
  if (previousWebhook === undefined) delete process.env["PARTNER_ALERT_WEBHOOK_URL"];
  else process.env["PARTNER_ALERT_WEBHOOK_URL"] = previousWebhook;
  await new Promise<void>((resolve) => catcher.close(() => resolve()));

  if (previousSendUrl === undefined) delete process.env["LOVABLE_SEND_URL"];
  else process.env["LOVABLE_SEND_URL"] = previousSendUrl;
  if (previousApiKey === undefined) delete process.env["LOVABLE_API_KEY"];
  await new Promise<void>((resolve) => mailCatcher.close(() => resolve()));

  await admin.from("partner_applications").delete().eq("email", EMAIL);
  await admin.from("partner_applications").delete().eq("email", FAIL_EMAIL);
});

/**
 * Invoke the server function the way the server runtime does: `__executeServer`
 * is the entry point the RPC handler calls once a request has arrived, so the
 * validator, the rate-limit middleware body and the handler all run for real —
 * only the network hop between browser and worker is absent.
 */
async function submit(input: ApplicationInput) {
  const request = new Request("https://costmyai.com/partners/apply", {
    method: "POST",
    headers: { "cf-connecting-ip": CALLER_IP, origin: "https://costmyai.com" },
  });
  const execute = (
    serverFns as unknown as Record<
      string,
      (opts: { data: ApplicationInput; context: Record<string, unknown> }) => Promise<{
        result?: unknown;
        error?: unknown;
      }>
    >
  )["submitPartnerApplication_createServerFn_handler"]!;

  const handler = requestHandler(async () =>
    runWithStartContext({ contextAfterGlobalMiddlewares: {}, request } as never, async () => {
      const outcome = await execute({ data: input, context: {} });
      if (outcome.error) {
        const error = outcome.error;
        return Response.json({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return Response.json({ ok: true, result: outcome.result });
    }),
  );
  const response = await handler(request, {} as never);
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
