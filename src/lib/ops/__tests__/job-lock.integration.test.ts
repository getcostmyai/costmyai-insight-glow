/**
 * Proof for the rollup-health single-flight lock.
 *
 * The risk it closes is not corruption — two repairs of the same workspace
 * converge — but a transient hole: while both passes run, a reader can see a
 * bucket one run has deleted and the other has not yet rewritten. So what has
 * to be proved is serialisation, not merely "it did not crash": overlapping
 * runs must never both be inside the critical section at the same instant.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { guardIntegrationDatabase } from "@/lib/__tests__/support/isolation";

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

const JOB = `rollup-health-test-${Date.now()}`;

const acquire = async (ttl = 60) =>
  (await admin.rpc("job_lock_acquire" as never, { _job: JOB, _ttl_seconds: ttl } as never)).data as
    | string
    | null;
const release = async (token: string) =>
  admin.rpc("job_lock_release" as never, { _job: JOB, _token: token } as never);

describe("scheduled-job single-flight lock", () => {
  it("lets exactly one of two simultaneous runs proceed", async () => {
    const [a, b] = await Promise.all([acquire(), acquire()]);
    const winners = [a, b].filter(Boolean) as string[];
    expect(winners).toHaveLength(1);
    await release(winners[0]!);
  }, 30_000);

  it("serialises two overlapping sweeps — never both inside at once", async () => {
    let inSection = 0;
    let peak = 0;
    let skipped = 0;

    const sweep = async () => {
      const token = await acquire();
      if (!token) {
        skipped += 1;
        return;
      }
      inSection += 1;
      peak = Math.max(peak, inSection);
      await new Promise((r) => setTimeout(r, 300)); // stands in for the repair pass
      inSection -= 1;
      await release(token);
    };

    await Promise.all([sweep(), sweep(), sweep()]);

    expect(peak).toBe(1); // the whole point: never two passes at once
    expect(skipped).toBe(2); // overlapping ticks no-op rather than race
  }, 30_000);

  it("releases automatically so a crashed run cannot wedge the schedule", async () => {
    const first = await acquire(1); // 1s lease, then abandoned without release
    expect(first).toBeTruthy();
    expect(await acquire()).toBeNull(); // still held

    await new Promise((r) => setTimeout(r, 1500));
    const second = await acquire();
    expect(second).toBeTruthy(); // expired lease is takeable
    await release(second!);
  }, 30_000);

  it("refuses a release with the wrong token", async () => {
    const token = await acquire();
    const wrong = await release("00000000-0000-0000-0000-000000000000");
    expect(wrong.data).toBe(false);
    expect(await acquire()).toBeNull(); // still held by the real owner
    await release(token!);
  }, 30_000);
});
