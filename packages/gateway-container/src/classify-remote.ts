import {
  extractSignalText,
  REMOTE_CLASSIFIER_REVISION,
  type AbstainReason,
  type TaskDecision,
} from "./classify-local.js";
import { INGEST_API_VERSION, INGEST_PATHS, UNKNOWN_TASK_HINT, type ContainerConfig, type TaskHint } from "./config.js";

/**
 * Remote task classification (Dispatch 236).
 *
 * The local rules classifier is honest but structurally partial: on the real
 * Chain Drill golden set it is right 36% of the time and wrong 0% of the time,
 * because two whole buckets — `reasoning` and `agentic` — have no lexical
 * signature it can see, so it abstains on them by construction. `gpt-5-mini`
 * with strict tool-constrained decoding scores 96.5% on the same set. That gap
 * is the entire reason this file exists.
 *
 * Three rules govern it, and they are the ones that make it safe to add:
 *
 *  1. **Never on the request path.** The classification call is fired AFTER the
 *     caller already has their response. The customer's inference latency is
 *     unchanged to the byte and to the millisecond; a classifier outage is
 *     invisible to their traffic.
 *  2. **Never blocks, never queues.** A bounded pool of slots. No free slot
 *     means `pool_saturated` — an abstention, immediately — not a backlog that
 *     grows until the process dies.
 *  3. **Failure degrades to refusal, never to a guess.** Unreachable, non-2xx,
 *     timed out, saturated: every one of them returns the same
 *     `unknown/0` decision the local classifier already produces, and the
 *     ladder refuses it exactly as it always has.
 *
 * What leaves the container changes here, and that is why this ships as a new
 * image line (`v3`) rather than a `v2` retrofit: the extracted prompt text is
 * sent to CostMyAI. `v2`'s claim — structural shape only, nothing meaningful
 * leaves the process — is false under this file, and a claim that stops being
 * true must not do so under a moving tag. See DECISIONS.md §12.
 */

/**
 * Pool width, re-derived from gpt-5-mini's OWN measured latency. Not inherited
 * from the nano probe's width of 6 — a width is a function of the service time
 * of the model actually in the loop.
 *
 * Same method, same throughput target as the nano derivation:
 *
 *   Observed peak proxy concurrency in the drills ......... 10 in flight
 *   Mean proxied completion duration ...................... ~2.0 s
 *   Implied classification arrival rate  λ = 10 / 2.0 ..... 5 req/s
 *   Measured gpt-5-mini p90 (40 real calls, this tree) .... 1.328 s
 *   Little's law  width = ceil(λ × p90) = ceil(5 × 1.328) . 7
 *
 * (p50 954 ms, min 664 ms, max 2991 ms, 40/40 strict-schema valid.)
 *
 * Sized on p90 rather than p50 deliberately: the pool exists to absorb the slow
 * tail, and a p50-sized pool spends the tail shedding work it could have done.
 */
export const REMOTE_POOL_WIDTH = 7;

/**
 * Bound on one classification call. Well beyond the measured max (2.99 s) so a
 * normal slow call completes, short enough that a hung slot frees within one
 * flush interval instead of holding a seat all day.
 */
export const REMOTE_TIMEOUT_MS = 8_000;

/** Nothing beyond this many characters of extracted text is sent. */
const MAX_SEND_CHARS = 4_000;

const ABSTAIN = (reason: AbstainReason): TaskDecision => ({
  hint: UNKNOWN_TASK_HINT,
  confidence: 0,
  source: "abstained",
  abstained: reason,
  signals: [],
});

export interface RemoteLabel {
  hint: TaskHint;
  confidence: number;
}

/**
 * A fixed number of concurrent slots. `tryAcquire` never waits: it either hands
 * out a slot or reports saturation, because the alternative — an unbounded
 * queue of classification work behind a customer's traffic spike — is a memory
 * leak with a latency graph attached.
 */
export class SlotPool {
  private inUse = 0;

  constructor(private readonly width: number = REMOTE_POOL_WIDTH) {}

  get busy(): number {
    return this.inUse;
  }

  get free(): number {
    return Math.max(0, this.width - this.inUse);
  }

  tryAcquire(): (() => void) | null {
    if (this.inUse >= this.width) return null;
    this.inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inUse -= 1;
    };
  }
}

export interface RemoteClassifierDeps {
  config: ContainerConfig;
  fetchImpl?: typeof fetch;
  pool?: SlotPool;
  timeoutMs?: number;
}

export class RemoteClassifier {
  private readonly pool: SlotPool;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly deps: RemoteClassifierDeps) {
    this.pool = deps.pool ?? new SlotPool();
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.timeoutMs = deps.timeoutMs ?? REMOTE_TIMEOUT_MS;
  }

  get poolBusy(): number {
    return this.pool.busy;
  }

  /**
   * Classify one request body remotely. Resolves to a decision — success or
   * abstention — and never rejects: a caller on the metadata path must not have
   * to guard a classification with a try/catch to keep an event moving.
   */
  async classify(body: Uint8Array | undefined): Promise<TaskDecision> {
    const extracted = extractSignalText(body);
    if (!extracted) return ABSTAIN("unreadable");
    const text = extracted.text.slice(0, MAX_SEND_CHARS).trim();
    if (text.length < 12 && !extracted.toolsDeclared && !extracted.toolTraffic) {
      return ABSTAIN("no_content");
    }

    const release = this.pool.tryAcquire();
    if (!release) return ABSTAIN("pool_saturated");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.deps.config.baseUrl}${INGEST_PATHS.classify}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.deps.config.ingestToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          v: INGEST_API_VERSION,
          text,
          tools_declared: extracted.toolsDeclared,
          tool_traffic: extracted.toolTraffic,
          schema_constrained: extracted.schemaConstrained,
        }),
      });
      if (!res.ok) return ABSTAIN("remote_unavailable");
      const json = (await res.json()) as { hint?: unknown; confidence?: unknown };
      const hint = typeof json.hint === "string" ? json.hint : UNKNOWN_TASK_HINT;
      if (hint === UNKNOWN_TASK_HINT) return ABSTAIN("weak_signal");
      const confidence = typeof json.confidence === "number" ? json.confidence : 0;
      if (!(confidence > 0)) return ABSTAIN("weak_signal");
      return {
        hint: hint as TaskHint,
        confidence: Math.min(1, Math.round(confidence * 100) / 100),
        source: "content",
        signals: ["remote.gpt-5-mini"],
      };
    } catch (err) {
      // An abort is the timeout we armed; anything else is the network.
      const aborted = (err as { name?: string } | null)?.name === "AbortError";
      return ABSTAIN(aborted ? "remote_timeout" : "remote_unavailable");
    } finally {
      clearTimeout(timer);
      release();
    }
  }
}

export { REMOTE_CLASSIFIER_REVISION };
