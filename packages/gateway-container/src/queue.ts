import { INGEST_API_VERSION, INGEST_PATHS, type ContainerConfig } from "./config.js";

/**
 * Offline-safe upstream queue.
 *
 * The hard rule: a CostMyAI outage must never affect the customer's inference.
 * Metadata is appended to an in-memory spool (persisted by the caller between
 * restarts), flushed in batches, and any batch that fails to reach us is put
 * back at the front of the queue and retried with backoff. Nothing upstream is
 * ever awaited on the request path.
 */

export interface QueueItem {
  kind: "events" | "billing";
  body: unknown;
}

export interface DrainReport {
  sent: number;
  remaining: number;
  lastError?: string;
}

export class UpstreamQueue {
  private items: QueueItem[] = [];

  constructor(
    private readonly config: ContainerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Beyond this, the oldest metadata is dropped rather than growing without bound. */
    private readonly maxItems = 10_000,
  ) {}

  get size(): number {
    return this.items.length;
  }

  snapshot(): QueueItem[] {
    return [...this.items];
  }

  restore(items: QueueItem[]): void {
    this.items = [...items, ...this.items].slice(-this.maxItems);
  }

  enqueue(item: QueueItem): void {
    this.items.push(item);
    if (this.items.length > this.maxItems) this.items = this.items.slice(-this.maxItems);
  }

  /**
   * Try to send everything we're holding. Stops at the first failure and keeps
   * the rest queued — order matters less than never losing a batch, and the
   * server is idempotent so a re-send of an already-accepted batch is free.
   */
  async drain(): Promise<DrainReport> {
    let sent = 0;
    while (this.items.length > 0) {
      const item = this.items[0];
      try {
        const res = await this.fetchImpl(`${this.config.baseUrl}${INGEST_PATHS[item.kind]}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.ingestToken}`,
          },
          body: JSON.stringify({ v: INGEST_API_VERSION, ...(item.body as object) }),
        });
        if (res.status === 401) {
          return {
            sent,
            remaining: this.items.length,
            lastError:
              "CostMyAI rejected the ingest token (401). It was rotated or revoked — generate a new token in Settings → Ingest tokens and restart the container. Metadata stays queued locally in the meantime.",
          };
        }
        if (!res.ok) {
          return { sent, remaining: this.items.length, lastError: `upstream ${res.status}` };
        }
        this.items.shift();
        sent += 1;
      } catch (err) {
        return {
          sent,
          remaining: this.items.length,
          lastError: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return { sent, remaining: 0 };
  }
}
