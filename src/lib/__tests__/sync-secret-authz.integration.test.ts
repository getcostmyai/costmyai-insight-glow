/**
 * Attempted-access test for the shared-secret cron routes.
 *
 * These routes sit under /api/public/* so an external scheduler can reach
 * them, which means the shared secret is the only thing between a stranger and
 * a job that writes to the database. Asserting the secret check "exists" by
 * reading source is not evidence. This imports each route's real POST handler
 * and calls it with real Request objects:
 *
 *   - wrong secret          -> 401, and nothing downstream is imported
 *   - missing header        -> 401
 *   - secret not configured -> 503 (fail closed, never open)
 *
 * The correct-secret path is deliberately not exercised: these handlers do real
 * work (price syncs, payouts, backups) and a test must not trigger that.
 */

import { afterEach, describe, expect, it } from "vitest";

import { Route as backupExport } from "@/routes/api/public/sync/backup-export";
import { Route as benchmarks } from "@/routes/api/public/sync/benchmarks";
import { Route as freeze } from "@/routes/api/public/sync/freeze";
import { Route as intelligenceLeads } from "@/routes/api/public/sync/intelligence-leads";
import { Route as jobAlerts } from "@/routes/api/public/sync/job-alerts";
import { Route as partnerPayouts } from "@/routes/api/public/sync/partner-payouts";
import { Route as prices } from "@/routes/api/public/sync/prices";
import { Route as reprocess } from "@/routes/api/public/sync/reprocess";
import { Route as rollupHealth } from "@/routes/api/public/sync/rollup-health";
import { Route as schemaFilters } from "@/routes/api/public/sync/schema-filters";
import { Route as taskDrift } from "@/routes/api/public/sync/task-drift";

type AnyRoute = { options?: { server?: { handlers?: Record<string, unknown> } } };

const ROUTES: Array<{ path: string; route: AnyRoute }> = [
  { path: "/api/public/sync/backup-export", route: backupExport as unknown as AnyRoute },
  { path: "/api/public/sync/benchmarks", route: benchmarks as unknown as AnyRoute },
  { path: "/api/public/sync/freeze", route: freeze as unknown as AnyRoute },
  { path: "/api/public/sync/intelligence-leads", route: intelligenceLeads as unknown as AnyRoute },
  { path: "/api/public/sync/job-alerts", route: jobAlerts as unknown as AnyRoute },
  { path: "/api/public/sync/partner-payouts", route: partnerPayouts as unknown as AnyRoute },
  { path: "/api/public/sync/prices", route: prices as unknown as AnyRoute },
  { path: "/api/public/sync/reprocess", route: reprocess as unknown as AnyRoute },
  { path: "/api/public/sync/rollup-health", route: rollupHealth as unknown as AnyRoute },
  { path: "/api/public/sync/schema-filters", route: schemaFilters as unknown as AnyRoute },
  { path: "/api/public/sync/task-drift", route: taskDrift as unknown as AnyRoute },
];

type Handler = (ctx: { request: Request }) => Promise<Response> | Response;

function postHandler(route: AnyRoute, path: string): Handler {
  const raw = route.options?.server?.handlers?.["POST"];
  const fn = typeof raw === "function" ? raw : (raw as { handler?: unknown } | undefined)?.handler;
  if (typeof fn !== "function") throw new Error(`${path} exposes no POST handler`);
  return fn as Handler;
}

function request(path: string, secret?: string): Request {
  return new Request(`https://www.costmyai.com${path}`, {
    method: "POST",
    headers: secret === undefined ? {} : { "x-sync-secret": secret },
  });
}

const original = process.env["SYNC_CRON_SECRET"];

afterEach(() => {
  if (original === undefined) delete process.env["SYNC_CRON_SECRET"];
  else process.env["SYNC_CRON_SECRET"] = original;
});

describe("sync cron routes refuse unauthenticated callers", () => {
  for (const { path, route } of ROUTES) {
    it(`${path} answers 401 to a wrong secret`, async () => {
      process.env["SYNC_CRON_SECRET"] = "the-real-secret-value";
      const response = await postHandler(
        route,
        path,
      )({
        request: request(path, "not-the-real-secret-value"),
      });
      expect(response.status).toBe(401);
    });

    it(`${path} answers 401 when the header is missing entirely`, async () => {
      process.env["SYNC_CRON_SECRET"] = "the-real-secret-value";
      const response = await postHandler(route, path)({ request: request(path) });
      expect(response.status).toBe(401);
    });

    it(`${path} fails closed with 503 when no secret is configured`, async () => {
      delete process.env["SYNC_CRON_SECRET"];
      const response = await postHandler(
        route,
        path,
      )({
        request: request(path, "anything-at-all"),
      });
      expect(response.status).toBe(503);
    });
  }
});
