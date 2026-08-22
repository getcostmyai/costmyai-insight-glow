/**
 * Session windowing, proven end to end rather than argued from the logic.
 *
 * The claim is narrow: events fired by the same visitor inside 30 minutes are
 * one visit, and a gap longer than that is a new visit. So the test drives the
 * real cookie round trip — the exact `Set-Cookie` string the server would send,
 * parsed back the way a browser would send it — and then writes real rows to
 * `lead_events` with the session ids it produced, so the grouping is proven in
 * the database and not only in memory.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
  nextSession,
  parseSessionCookie,
} from "@/lib/telemetry/session-cookie";
import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

/** What the browser would send back on the next request. */
function cookieValueFrom(setCookie: string): string {
  const first = setCookie.split(";")[0]!;
  return decodeURIComponent(first.slice(first.indexOf("=") + 1));
}

const MIN = 60_000;
const rows: string[] = [];

afterAll(async () => {
  if (rows.length) await admin.from("lead_events").delete().in("id", rows);
});

describe("session cookie", () => {
  it("carries the same session across a 5 minute gap and starts a new one after 31", () => {
    const t0 = Date.UTC(2026, 7, 22, 10, 0, 0);

    const first = nextSession(null, t0, true);
    expect(first.isNew).toBe(true);

    const near = nextSession(cookieValueFrom(first.setCookie), t0 + 5 * MIN, true);
    expect(near.id).toBe(first.id);
    expect(near.isNew).toBe(false);

    // The idle window slides: the second event's cookie is stamped at +5m, so
    // the third, 31 minutes after *that*, is what expires it.
    const far = nextSession(cookieValueFrom(near.setCookie), t0 + 5 * MIN + 31 * MIN, true);
    expect(far.isNew).toBe(true);
    expect(far.id).not.toBe(first.id);
  });

  it("follows the cma_vid serialization conventions exactly", () => {
    const { setCookie } = nextSession(null, Date.now(), true);
    expect(setCookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Secure");
    // Session-scoped, not a fixed long life like cma_vid's one year.
    expect(setCookie).toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE}`);
    expect(SESSION_COOKIE_MAX_AGE).toBe(1800);
    expect(nextSession(null, Date.now(), false).setCookie).not.toContain("Secure");
  });

  it("refuses a malformed or stampless cookie instead of trusting it", () => {
    expect(parseSessionCookie("not-a-session")).toBeNull();
    expect(parseSessionCookie("11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(parseSessionCookie("11111111-1111-1111-1111-111111111111.abc")).toBeNull();
    const forged = nextSession("11111111-1111-1111-1111-111111111111.x", Date.now(), true);
    expect(forged.isNew).toBe(true);
  });

  it("groups real lead_events rows by visit for one visitor", async () => {
    const visitorId = crypto.randomUUID();
    const t0 = Date.now() - 2 * 60 * MIN;

    const a = nextSession(null, t0, true);
    const b = nextSession(cookieValueFrom(a.setCookie), t0 + 5 * MIN, true);
    const c = nextSession(cookieValueFrom(b.setCookie), t0 + 5 * MIN + 31 * MIN, true);

    const { data, error } = await admin
      .from("lead_events")
      .insert([
        {
          event_type: "estimator_viewed",
          visitor_id: visitorId,
          session_id: a.id,
          created_at: new Date(t0).toISOString(),
        },
        {
          event_type: "estimator_engaged",
          visitor_id: visitorId,
          session_id: b.id,
          created_at: new Date(t0 + 5 * MIN).toISOString(),
        },
        {
          event_type: "estimator_viewed",
          visitor_id: visitorId,
          session_id: c.id,
          created_at: new Date(t0 + 36 * MIN).toISOString(),
        },
      ])
      .select("id, session_id, event_type");

    expect(error).toBeNull();
    rows.push(...(data ?? []).map((r) => r.id));

    const { data: back } = await admin
      .from("lead_events")
      .select("session_id, created_at")
      .eq("visitor_id", visitorId)
      .order("created_at", { ascending: true });

    const ids = (back ?? []).map((r) => r.session_id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(ids[1]); // 5 minutes apart — one visit
    expect(ids[2]).not.toBe(ids[0]); // 31 minutes later — a second visit
    expect(new Set(ids).size).toBe(2);
  });
});
