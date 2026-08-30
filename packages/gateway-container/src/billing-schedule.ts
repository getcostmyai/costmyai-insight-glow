import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ProviderConnectionState } from "../../../src/lib/ingest/backfill.js";
import { pollProvider, type InvoiceReader, type PollResult } from "./billing-poll.js";
import type { UpstreamQueue } from "./queue.js";

/**
 * Billing poll scheduling and its persisted state.
 *
 * `pollProvider` has existed, tested, since the backfill work, and was never
 * called by the shipped container: the documented reconciliation feature was
 * dead code in production. This file is the wiring, and it is deliberately as
 * boring as the spool: an interval, a disk file, and no decisions of its own.
 *
 * The state file matters more than it looks. `planBillingPoll` uses
 * `lastPolledAt` to choose between a 30-day first-connection backfill and the
 * short rolling window. Without persistence, every container restart looks
 * like a first connection and re-pulls a full month — idempotent upstream, so
 * never wrong, but a needless month of provider API calls on every deploy.
 */

export interface BillingSchedulerStatus {
  enabled: boolean;
  provider: string;
  intervalMs: number;
  lastPolledAt: string | null;
  lastRunAt: string | null;
  lastCaptures: number | null;
  lastError: string | null;
  coverageNotes: string[];
  runs: number;
}

/**
 * Disk-backed `ProviderConnectionState`.
 *
 * Written as one atomic replace (temp file + rename), exactly as `spool.ts`
 * does, so a crash mid-write cannot leave half a JSON document that reads back
 * as "never polled".
 */
export class BillingStateStore {
  constructor(private readonly file: string) {}

  load(provider: string): ProviderConnectionState {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<ProviderConnectionState>;
      if (parsed && parsed.provider === provider) {
        return {
          provider,
          lastPolledAt: typeof parsed.lastPolledAt === "string" ? parsed.lastPolledAt : null,
          historyDays: typeof parsed.historyDays === "number" ? parsed.historyDays : null,
        };
      }
    } catch {
      /* absent or corrupt state reads as "never polled" — a safe re-backfill */
    }
    return { provider, lastPolledAt: null, historyDays: null };
  }

  persist(state: ProviderConnectionState): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, this.file);
  }
}

export class BillingScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: ProviderConnectionState;
  private lastRunAtMs: number | null = null;
  private lastCaptures: number | null = null;
  private lastError: string | null = null;
  private coverageNotes: string[] = [];
  private runs = 0;

  constructor(
    private readonly provider: string,
    private readonly reader: InvoiceReader,
    private readonly queue: UpstreamQueue,
    private readonly store: BillingStateStore,
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.state = this.store.load(provider);
  }

  status(): BillingSchedulerStatus {
    return {
      enabled: true,
      provider: this.provider,
      intervalMs: this.intervalMs,
      lastPolledAt: this.state.lastPolledAt ?? null,
      lastRunAt: this.lastRunAtMs === null ? null : new Date(this.lastRunAtMs).toISOString(),
      lastCaptures: this.lastCaptures,
      lastError: this.lastError,
      coverageNotes: this.coverageNotes,
      runs: this.runs,
    };
  }

  /**
   * One poll. Never throws — a provider billing API outage is an observability
   * event, not something that may touch the customer's traffic. On failure the
   * state is left untouched, so the next run covers the same window again.
   */
  async pollOnce(): Promise<PollResult | null> {
    try {
      const result = await pollProvider(this.state, this.reader, this.queue, new Date(this.now()));
      this.state = result.state;
      this.store.persist(this.state);
      this.lastCaptures = result.captures;
      this.coverageNotes = result.coverageNotes;
      this.lastError = null;
      this.runs += 1;
      this.lastRunAtMs = this.now();
      return result;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.lastRunAtMs = this.now();
      return null;
    }
  }

  /** Starts the background loop. Returns a stop function. */
  start(): () => void {
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs);
    this.timer.unref?.();
    return () => this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
