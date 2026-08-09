/**
 * Dispatch 162 — real rerouted traffic behind a minority of demo switches.
 *
 *   bun run scripts/seed-rerouted-demo.ts [--dry]
 *
 * What this does, and just as importantly what it refuses to do:
 *
 *   - It promotes a *minority* of each demo workspace's switches to executable
 *     by writing the real Phase 2 artefact a customer writes — a granted row in
 *     `org_provider_routing` for the destination host, through the same
 *     `assertRoutingGrants` a container calls. There is no demo-only path.
 *   - It generates rerouted metadata events and pushes them through
 *     `ingestEvents`, the one real write path into a workspace's usage. Ingest
 *     rebuilds the rollups from the stored events and then calls
 *     `recomputeSwitchSavings` itself, so `saved_usd` is measured by the
 *     product's own code from rows that exist.
 *   - It never writes `saved_usd`. Not once, not as a fallback, not "to check".
 *     The database trigger `enforce_savings_gate` refuses a hand-set figure on
 *     a switch that cannot execute, and this script does not have a line that
 *     would test that refusal.
 *
 * Why the traffic only lands on some days: `rebuildRollups` is authoritative
 * for the window it touches — it deletes and re-derives every day bucket in
 * range from the raw events. The demo's older day buckets were seeded without
 * raw events behind them, so ingesting into those days would erase real demo
 * history. The script therefore computes, per workspace, the days whose stored
 * rollups already reconcile exactly with their raw events, ingests only into
 * those, and aborts if any other day would be caught in a rebuild range.
 */
import { execFileSync } from "node:child_process";

import { ingestEvents } from "../src/lib/ingest/ingest.server";
import { ingestEventSchema } from "../src/lib/ingest/schema";
import { assertRoutingGrants, listRoutingGrants } from "../src/lib/ingest/routing.server";

const DRY = process.argv.includes("--dry");

/**
 * The promoted minority. Fixed ids, not "the top N by a query that could pick
 * something else tomorrow" — a demo that quietly re-promotes itself is a demo
 * nobody can reason about.
 */
const PROMOTED: Record<string, string[]> = {
  "00000000-0000-0000-0000-000000000001": [
    "690037d7-0298-41e3-8143-8fe7edad49c0", // azure → openai, gpt-5.5
    "350216fc-f5a9-4257-818e-0c5ec0f42dfa", // azure → openai, gpt-5.4
    "dbc987e6-37bb-4822-be1b-62ca3d26783e", // alibaba → ionstream, qwen3-coder-next
  ],
  "00000000-0000-0000-0000-000000000002": [
    // Dispatch 163: locked to the one switch in this workspace with real
    // backing traffic. Its gpt-5.5 and gpt-5.4 azure switches are fixtures with
    // no observed stream here, and crediting them would mean inventing traffic,
    // so they stay gated rather than being padded out to a round number.
    "c4919085-85ec-4fe9-97ff-64532f575e94", // alibaba → ionstream, qwen3-coder-next
  ],


};

/** Share of the matching stream the switch is shown to have moved. */
const ADOPTION = 0.5;
const DAY_MS = 86_400_000;

function q<T = any>(sql: string): T[] {
  const out = execFileSync("psql", ["-At", "-c", `select coalesce(json_agg(t),'[]') from (${sql}) t`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim());
}

/** Deterministic per switch and day, so a re-run regenerates identical events. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SwitchRow {
  id: string;
  org_id: string;
  from_model: string;
  from_host: string;
  to_model: string;
  to_host: string;
  status: string;
  activated_at: string;
}

interface DayPair {
  day: string;
  requests: number;
  task_hint: string;
  avg_in: number;
  avg_out: number;
}

async function main() {
  const ids = Object.values(PROMOTED).flat();
  const switches = q<SwitchRow>(
    `select id::text, org_id::text, from_model, from_host, to_model, to_host, status, activated_at::text
       from public.switches where id in (${ids.map((i) => `'${i}'`).join(",")})`,
  );
  if (switches.length !== ids.length) {
    throw new Error(`expected ${ids.length} switches, found ${switches.length}`);
  }
  for (const s of switches) {
    if (s.status !== "active") throw new Error(`${s.id} is ${s.status}, not active`);
  }

  for (const [orgId, switchIds] of Object.entries(PROMOTED)) {
    console.log(`\n=== workspace ${orgId} ===`);

    /**
     * Days whose stored day-rollup requests equal the raw events actually
     * stored for that day. Only these can survive a rebuild unchanged.
     */
    const days = q<{ day: string; raw: number; rollup: number }>(
      `select to_char(d, 'YYYY-MM-DD') as day, raw, rollup from (
         select coalesce(r.d, u.d) as d, coalesce(r.c, 0) as raw, coalesce(u.c, 0) as rollup from
           (select date_trunc('day', occurred_at) d, count(*) c from public.usage_events
              where org_id = '${orgId}' group by 1) r
         full join
           (select bucket_start d, sum(requests) c from public.usage_rollups
              where org_id = '${orgId}' and granularity = 'day' group by 1) u
         on r.d = u.d
       ) x order by d`,
    );
    const safe = new Set(days.filter((d) => Number(d.raw) === Number(d.rollup) && Number(d.raw) > 0).map((d) => d.day));
    const unsafe = new Map(
      days.filter((d) => !safe.has(d.day)).map((d) => [d.day, Number(d.rollup)] as const),
    );
    console.log(`safe days: ${[...safe].join(", ") || "(none)"}`);
    if (safe.size === 0) throw new Error("no day reconciles with its raw events — refusing to ingest");

    // Grants first: the gate is resolved from workspace state at recompute time.
    const grantHosts = [
      ...new Set(
        switches
          .filter((s) => switchIds.includes(s.id) && s.from_host.toLowerCase() !== s.to_host.toLowerCase())
          .map((s) => s.to_host.toLowerCase()),
      ),
    ];
    if (!DRY && grantHosts.length) {
      const written = await assertRoutingGrants(orgId, grantHosts, "demo-container-1");
      console.log(`granted routing: ${written.map((g) => `${g.host}=${g.granted}`).join(", ")}`);
    }
    const sameHost = switches.filter(
      (s) => switchIds.includes(s.id) && s.from_host.toLowerCase() === s.to_host.toLowerCase(),
    );
    if (sameHost.length) {
      const live = new Set((await listRoutingGrants(orgId)).filter((g) => !g.revokedAt).map((g) => g.host));
      for (const s of sameHost) {
        if (!live.has(s.to_host.toLowerCase())) {
          throw new Error(`${s.id}: same-host switch needs a connected row for ${s.to_host}`);
        }
      }
    }

    /** day → events, so each ingest call rebuilds exactly one day. */
    const byDay = new Map<string, any[]>();

    for (const s of switches.filter((x) => switchIds.includes(x.id))) {
      /**
       * The stream the switch moved, measured on the source pair as it ran
       * *before* the switch was activated. Sizing off what is left on the
       * source pair afterwards would be backwards: traffic that moved is
       * recorded on the destination, so a working switch would size itself
       * down to nothing.
       */
      const [baseline] = q<{ requests: number; task_hint: string; avg_in: number; avg_out: number }>(
        `select round(avg(requests))::int as requests, max(task_hint) as task_hint,
                round(avg(input_tokens::numeric / greatest(requests,1)))::int as avg_in,
                round(avg(output_tokens::numeric / greatest(requests,1)))::int as avg_out
           from public.usage_rollups
          where org_id = '${orgId}' and granularity = 'day'
            and model_key = '${s.from_model}' and host = '${s.from_host}'
            and bucket_start < date_trunc('day', timestamptz '${s.activated_at}')
            and bucket_start >= date_trunc('day', timestamptz '${s.activated_at}') - interval '7 days'`,
      );
      if (!baseline?.requests) throw new Error(`${s.id}: no observed baseline for ${s.from_model}@${s.from_host}`);

      const activatedDay = s.activated_at.slice(0, 10);
      let generated = 0;
      for (const day of [...safe].sort()) {
        if (day < activatedDay) continue;
        const n = Math.round(Number(baseline.requests) * ADOPTION);
        if (n <= 0) continue;
        const rand = rng(`${s.id}:${day}`);
        const dayStart = new Date(`${day}T00:00:00.000Z`).getTime();
        const list = byDay.get(day) ?? [];

        for (let i = 0; i < n; i++) {
          // Spread across the day, jittered, never beyond the day itself.
          const at = new Date(dayStart + Math.min(DAY_MS - 1, ((i + rand()) / n) * DAY_MS));
          const jitter = (avg: number) => Math.max(1, Math.round(avg * (0.75 + rand() * 0.5)));
          list.push(
            ingestEventSchema.parse({
              occurred_at: at.toISOString(),
              model_key: s.to_model,
              host: s.to_host,
              task_hint: baseline.task_hint,
              input_tokens: jitter(Number(baseline.avg_in)),
              output_tokens: jitter(Number(baseline.avg_out)),
              latency_ms: Math.round(400 + rand() * 2600),
              status: "ok",
              parse_status: "parsed",
              rerouted: true,
              original_model_key: s.from_model,
              original_host: s.from_host,
              route_reason: s.id,
              idempotency_key: `d162:${s.id}:${day}:${i}`,
            }),
          );
        }
        byDay.set(day, list);
        generated += n;
      }

      console.log(`${s.id} ${s.from_model}@${s.from_host} → ${s.to_model}@${s.to_host}: ${generated} events`);
    }

    for (const [day, events] of [...byDay].sort()) {
      if (unsafe.has(day)) throw new Error(`refusing to rebuild ${day}: rollups do not reconcile`);
      console.log(`  ingesting ${events.length} events into ${day}${DRY ? " (dry run)" : ""}`);
      if (DRY) continue;
      const result = await ingestEvents(orgId, events);
      console.log(`   → ${JSON.stringify(result)}`);
    }
  }
}

await main();
console.log("\ndone");
