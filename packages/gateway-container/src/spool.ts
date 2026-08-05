import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { QueueItem } from "./queue";

/**
 * Disk-backed spool.
 *
 * The README has always promised that a mounted volume survives a restart.
 * This is that promise, made real, and bounded: capped by item count AND by
 * age, oldest evicted first. A long CostMyAI outage costs the customer their
 * oldest metadata, never their disk.
 *
 * Written as one atomic replace (temp file + rename) so a crash mid-write
 * cannot leave a half-parsed spool that silently drops everything on reload.
 */

export interface SpoolRecord {
  at: number;
  item: QueueItem;
}

export interface SpoolBounds {
  maxItems: number;
  maxAgeMs: number;
}

export class Spool {
  private readonly file: string;

  constructor(
    private readonly dir: string,
    private readonly bounds: SpoolBounds,
  ) {
    this.file = join(dir, "spool.jsonl");
  }

  private ensureDir(): void {
    mkdirSync(this.dir, { recursive: true });
  }

  /** Everything still inside the bounds, oldest first. */
  load(now = Date.now()): QueueItem[] {
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch {
      return [];
    }
    const records: SpoolRecord[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as SpoolRecord;
        if (parsed && typeof parsed.at === "number" && parsed.item) records.push(parsed);
      } catch {
        /* one corrupt line never invalidates the rest of the spool */
      }
    }
    return this.bound(records, now).map((r) => r.item);
  }

  /** Replace the on-disk spool with exactly what is still queued. */
  persist(items: QueueItem[], now = Date.now()): number {
    this.ensureDir();
    const records = this.bound(
      items.map((item) => ({ at: now, item })),
      now,
    );
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
    renameSync(tmp, this.file);
    return records.length;
  }

  private bound(records: SpoolRecord[], now: number): SpoolRecord[] {
    const fresh = records.filter((r) => now - r.at <= this.bounds.maxAgeMs);
    return fresh.length > this.bounds.maxItems ? fresh.slice(-this.bounds.maxItems) : fresh;
  }
}
