import { INGEST_PATHS, type ContainerConfig } from "./config.js";
import type { SwitchPlan, SwitchPlanEntry } from "../../../src/lib/ingest/switch-plan.js";

/**
 * The container's local view of its workspace's active switches
 * (Dispatch 155, Stage 3).
 *
 * One safety property governs every line of this file, and it is
 * non-negotiable: **unknown or stale state means pass-through.** A CostMyAI
 * outage, a slow poll, a 500, a truncated body, a clock jump — none of them may
 * change what a customer's traffic does, in either direction. Concretely:
 *
 *  - `lookup()` is synchronous and reads only memory. The request path never
 *    awaits us, never opens a socket to us, and cannot be delayed by us.
 *  - Before the first successful poll there is no plan, so nothing matches.
 *  - A failed poll never mutates the plan; the last good plan keeps serving.
 *  - A plan older than `STALE_AFTER_MS` stops being served entirely. We would
 *    rather forget a switch the customer enabled than keep acting on a decision
 *    we can no longer confirm.
 *  - Only entries the *server* marked `executable` are ever returned. The
 *    container decides nothing; it executes a decision already made.
 */

/** How long a plan may be served after it was fetched. Five poll intervals. */
export const STALE_AFTER_MS = 5 * 60_000;

/** Bound on the poll request itself. Off the request path, so generous. */
export const POLL_TIMEOUT_MS = 10_000;

export interface SwitchLookup {
  /** `switches.id`, echoed back on the event as `route_reason`. */
  id: string;
  target: { model_key: string; host: string };
  phase: SwitchPlanEntry["phase"];
}

export interface SwitchMapStatus {
  /** True only when a fresh, successfully fetched plan is being served. */
  active: boolean;
  fetchedAt: string | null;
  ageMs: number | null;
  stale: boolean;
  switches: number;
  executable: number;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Destinations this container holds a customer-granted key for. */
  grantedHosts: string[];
  grantsAsserted: boolean;
  lastGrantError: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

export class SwitchMap {
  private plan: SwitchPlan | null = null;
  private fetchedAtMs: number | null = null;
  private lastError: string | null = null;
  private lastErrorAtMs: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Hosts whose grant this container has already asserted this process. */
  private assertedHosts: string | null = null;
  private lastGrantError: string | null = null;

  constructor(
    private readonly config: ContainerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly staleAfterMs: number = STALE_AFTER_MS,
  ) {}

  /**
   * Synchronous, memory-only. Returns a rewrite target ONLY when a fresh plan
   * says this exact request is executable. Every other case returns null,
   * which means: forward the request exactly as the customer sent it.
   */
  lookup(modelKey: string | null | undefined, host: string | null | undefined): SwitchLookup | null {
    if (!this.isFresh()) return null;
    if (!modelKey || !host) return null;
    const model = norm(modelKey);
    const h = norm(host);
    for (const entry of this.plan?.switches ?? []) {
      if (!entry.executable) continue;
      if (!entry.match.model_keys.includes(model)) continue;
      if (!entry.match.hosts.includes(h)) continue;
      return { id: entry.id, target: entry.target, phase: entry.phase };
    }
    return null;
  }

  private isFresh(): boolean {
    if (!this.plan || this.fetchedAtMs === null) return false;
    const age = this.now() - this.fetchedAtMs;
    // A negative age (clock moved backwards) is treated as unknown, not fresh.
    return age >= 0 && age <= this.staleAfterMs;
  }

  status(): SwitchMapStatus {
    const age = this.fetchedAtMs === null ? null : this.now() - this.fetchedAtMs;
    const fresh = this.isFresh();
    return {
      active: fresh,
      fetchedAt: this.fetchedAtMs === null ? null : new Date(this.fetchedAtMs).toISOString(),
      ageMs: age,
      stale: this.plan !== null && !fresh,
      switches: fresh ? (this.plan?.switches.length ?? 0) : 0,
      executable: fresh ? (this.plan?.switches.filter((s) => s.executable).length ?? 0) : 0,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAtMs === null ? null : new Date(this.lastErrorAtMs).toISOString(),
      grantedHosts: Object.keys(this.config.routeKeys).sort(),
      grantsAsserted: this.assertedHosts !== null,
      lastGrantError: this.lastGrantError,
    };
  }

  /**
   * Dispatch 231. Tell the server which destinations this container holds a
   * customer-granted credential for.
   *
   * Only host NAMES travel — the schema on the other side is strict and has no
   * field a key could occupy, and this method never touches the values. A
   * failure is recorded and retried on the next poll; it never affects traffic,
   * and it never grants anything locally, because the container executes
   * decisions rather than making them.
   */
  async assertGrants(): Promise<boolean> {
    const hosts = Object.keys(this.config.routeKeys).sort();
    if (hosts.length === 0) return false;
    const signature = hosts.join(",");
    if (this.assertedHosts === signature) return true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${INGEST_PATHS.switches}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.ingestToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ v: 2, hosts, container_id: this.config.containerId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.lastGrantError = `grant assertion ${response.status}`;
        return false;
      }
      this.assertedHosts = signature;
      this.lastGrantError = null;
      return true;
    } catch (err) {
      this.lastGrantError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * One poll. Never throws — a control-plane failure is an observability event,
   * not an incident for the customer's traffic. Returns true on a plan refresh.
   */
  async refresh(): Promise<boolean> {
    // Grants first: a plan fetched before the server knows what this container
    // holds would report a Phase 2 destination as ungranted for one whole
    // interval, and the customer would read that as the product ignoring the
    // variable they just set.
    await this.assertGrants();
    const url = `${this.config.baseUrl}${INGEST_PATHS.switches}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.config.ingestToken}`,
          accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.fail(`switch plan ${response.status}`);
        return false;
      }
      const body = (await response.json()) as unknown;
      const plan = parsePlan(body);
      if (!plan) {
        this.fail("switch plan unreadable");
        return false;
      }
      this.plan = plan;
      this.fetchedAtMs = this.now();
      this.lastError = null;
      return true;
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private fail(message: string): void {
    // Deliberately does NOT touch `plan` or `fetchedAtMs`: a failed poll leaves
    // the last known-good plan in place until it ages out on its own.
    this.lastError = message;
    this.lastErrorAtMs = this.now();
  }

  /** Starts the background loop. Returns a stop function. */
  start(intervalMs: number): () => void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    this.timer.unref?.();
    return () => this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Structural validation of the plan. Anything we cannot read completely is
 * rejected wholesale — a half-understood plan is exactly the kind of guess this
 * file exists to prevent.
 */
export function parsePlan(body: unknown): SwitchPlan | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (raw["v"] !== 1) return null;
  if (typeof raw["org_id"] !== "string") return null;
  if (!Array.isArray(raw["switches"])) return null;

  const switches: SwitchPlanEntry[] = [];
  for (const item of raw["switches"] as unknown[]) {
    if (!item || typeof item !== "object") return null;
    const e = item as Record<string, unknown>;
    const match = e["match"] as Record<string, unknown> | undefined;
    const target = e["target"] as Record<string, unknown> | undefined;
    if (typeof e["id"] !== "string") return null;
    if (e["phase"] !== 1 && e["phase"] !== 2 && e["phase"] !== 3) return null;
    if (typeof e["executable"] !== "boolean") return null;
    if (!match || !Array.isArray(match["model_keys"]) || !Array.isArray(match["hosts"])) return null;
    if (!target || typeof target["model_key"] !== "string" || typeof target["host"] !== "string") {
      return null;
    }
    switches.push({
      id: e["id"],
      phase: e["phase"],
      match: {
        model_keys: (match["model_keys"] as unknown[]).map((m) => norm(String(m))),
        hosts: (match["hosts"] as unknown[]).map((h) => norm(String(h))),
      },
      target: { model_key: String(target["model_key"]), host: norm(String(target["host"])) },
      gate: e["gate"] as SwitchPlanEntry["gate"],
      executable: e["executable"],
      ...(typeof e["blocked_reason"] === "string"
        ? { blocked_reason: e["blocked_reason"] as SwitchPlanEntry["blocked_reason"] }
        : {}),
      needs_confirmation: e["needs_confirmation"] === true,
    });
  }

  const interval = raw["poll_interval_ms"];
  return {
    v: 1,
    org_id: raw["org_id"],
    generated_at: typeof raw["generated_at"] === "string" ? raw["generated_at"] : "",
    poll_interval_ms: typeof interval === "number" && interval > 0 ? interval : 60_000,
    switches,
  };
}
