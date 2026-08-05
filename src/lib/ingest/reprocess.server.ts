import { PARSER_REVISION, readUsage } from "../../../packages/gateway-container/src/parse";

import { adminClient, rebuildRollups } from "./ingest.server";
import { fetchAllRows } from "@/lib/paginate.server";

/**
 * Retroactive reprocessing (Dispatch 106).
 *
 * A shape parser that ships in month three does nothing for the traffic
 * recorded in month one. Tencent's envelope and Cloudflare's nesting were both
 * found in Stage 5; every event either would have produced before the fix was
 * metered degraded — `unparsed` (counted as zero, indistinguishable from
 * traffic that did not happen) or `tokens_only` (counted from a heuristic that
 * may have picked the wrong counter). Leaving those permanently wrong is a
 * dashboard that lies about a month the customer already paid for.
 *
 * The prerequisite was retention, and it is a real one: the connector holds no
 * response body, by charter. What it now retains for a degraded read only is a
 * content-free skeleton — keys and numbers, every string erased at the source
 * (see packages/gateway-container/src/skeleton.ts). That is precisely the
 * input `readUsage` consumes, and precisely nothing else.
 *
 * So reprocessing is the real parser, re-run against the real stored
 * structure, followed by the same `rebuildRollups` every ingest already uses.
 * No second metering path and no second rollup mechanism — a reprocessed hour
 * and an ingested hour are computed by identical code.
 */

const RANK: Record<string, number> = { unparsed: 0, tokens_only: 1, parsed: 2 };

export interface ReprocessResult {
  /** Degraded events carrying a skeleton that were examined. */
  scanned: number;
  /** Events whose parse_status improved. */
  upgraded: number;
  /** Of those, how many also had their token counts corrected. */
  tokensCorrected: number;
  /** Total token delta applied, so a sweep's effect on spend is auditable. */
  inputDelta: number;
  outputDelta: number;
  /** Rollup rows recomputed from the corrected events. */
  bucketsRebuilt: number;
  orgsTouched: number;
  revision: number;
}

const EMPTY_RESULT: Omit<ReprocessResult, "revision"> = {
  scanned: 0,
  upgraded: 0,
  tokensCorrected: 0,
  inputDelta: 0,
  outputDelta: 0,
  bucketsRebuilt: 0,
  orgsTouched: 0,
};

export interface DegradedEvent {
  id: number;
  org_id: string;
  occurred_at: string;
  status: string;
  parse_status: string;
  input_tokens: number;
  output_tokens: number;
  envelope_skeleton: unknown;
}

export interface EventCorrection {
  id: number;
  orgId: string;
  occurredAt: Date;
  parseStatus: string;
  inputTokens: number;
  outputTokens: number;
  tokensChanged: boolean;
}

/**
 * Decide, for one stored event, what the current parser makes of it.
 *
 * Pure and exported so the proof can run it without a database. Returns null
 * when the current parser is no better than the one that metered the event —
 * the overwhelming majority case on a re-run, and the reason a sweep is cheap.
 */
export function correctionFor(event: DegradedEvent): EventCorrection | null {
  if (!event.envelope_skeleton) return null;
  const reading = readUsage(event.envelope_skeleton);
  const before = RANK[event.parse_status] ?? 0;
  const after = RANK[reading.parseStatus] ?? 0;
  if (after <= before) return null;

  // A failed upstream call consumed the prompt and returned nothing. The same
  // rule ingest applies, applied again here rather than re-derived differently.
  const outputTokens = event.status === "error" ? 0 : reading.outputTokens;
  const tokensChanged =
    reading.inputTokens !== event.input_tokens || outputTokens !== event.output_tokens;

  return {
    id: event.id,
    orgId: event.org_id,
    occurredAt: new Date(event.occurred_at),
    parseStatus: reading.parseStatus,
    inputTokens: reading.inputTokens,
    outputTokens,
    tokensChanged,
  };
}

export interface ReprocessOptions {
  /** Limit the sweep to one workspace. Omitted, it covers every workspace. */
  orgId?: string;
  /** Safety bound on a single sweep. */
  maxEvents?: number;
  /** Recorded on every corrected row. */
  revision?: number;
}

/** Re-read every degraded event that kept a skeleton, and repair what improved. */
export async function reprocessDegradedEvents(
  options: ReprocessOptions = {},
): Promise<ReprocessResult> {
  const revision = options.revision ?? PARSER_REVISION;
  const maxEvents = options.maxEvents ?? 50_000;
  const db = adminClient();

  const rows = (await fetchAllRows(
    (from, to) => {
      let q = db
        .from("usage_events")
        .select("id, org_id, occurred_at, status, parse_status, input_tokens, output_tokens, envelope_skeleton")
        .neq("parse_status", "parsed")
        .not("envelope_skeleton", "is", null)
        .order("occurred_at", { ascending: true });
      if (options.orgId) q = q.eq("org_id", options.orgId);
      return q.range(from, to);
    },
    { maxPages: Math.ceil(maxEvents / 1000) },
  )) as unknown as DegradedEvent[];

  const corrections = rows.map(correctionFor).filter((c): c is EventCorrection => c !== null);
  if (corrections.length === 0) {
    return { ...EMPTY_RESULT, scanned: rows.length, revision };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const touched = new Map<string, Date[]>();
  const result: ReprocessResult = { ...EMPTY_RESULT, scanned: rows.length, revision };
  const reparsedAt = new Date().toISOString();

  for (const c of corrections) {
    /*
     * Dispatch 91. "Did not throw" is not a write. Each correction confirms it
     * actually changed a row before it is counted — a sweep that reports 400
     * repairs and performed none is exactly the failure this whole audit line
     * exists to prevent.
     */
    const { data, error } = await db
      .from("usage_events")
      .update({
        parse_status: c.parseStatus,
        input_tokens: c.inputTokens,
        output_tokens: c.outputTokens,
        reparsed_at: reparsedAt,
        parser_revision: revision,
      } as never)
      .eq("id", c.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`reprocess update failed for event ${c.id}: ${error.message}`);
    if (!data) continue;

    const before = byId.get(c.id)!;
    result.upgraded++;
    if (c.tokensChanged) {
      result.tokensCorrected++;
      result.inputDelta += c.inputTokens - before.input_tokens;
      result.outputDelta += c.outputTokens - before.output_tokens;
    }
    const list = touched.get(c.orgId) ?? [];
    list.push(c.occurredAt);
    touched.set(c.orgId, list);
  }

  // The same rebuild ingest runs, per workspace, over exactly the days the
  // corrections touched. Rollups are re-derived from the repaired events, never
  // adjusted by a delta — a rollup that disagrees with its own events is how a
  // dashboard starts lying.
  for (const [orgId, timestamps] of touched) {
    result.bucketsRebuilt += await rebuildRollups(orgId, timestamps);
  }
  result.orgsTouched = touched.size;

  return result;
}

const PARSER_REVISION_KEY = "parser_revision";

export interface ParserChangeOutcome {
  ran: boolean;
  revision: number;
  previous: number | null;
  reason: string;
  result?: ReprocessResult;
}

/**
 * The automatic trigger.
 *
 * Every parser that ships has already been through real-provider proof — that
 * is Stage 5's own standard — so a deploy that raises `PARSER_REVISION` needs
 * no further gate. This runs once per revision: the sweep, then the revision
 * is recorded, so the next call is a no-op until a parser changes again.
 */
export async function reprocessOnParserChange(
  options: { force?: boolean } = {},
): Promise<ParserChangeOutcome> {
  const db = adminClient();
  const { data: config } = await db
    .from("job_config")
    .select("value")
    .eq("key", PARSER_REVISION_KEY)
    .maybeSingle();

  const previous = config?.value ? Number(config.value) : null;
  if (!options.force && previous !== null && previous >= PARSER_REVISION) {
    return {
      ran: false,
      revision: PARSER_REVISION,
      previous,
      reason: `Parser revision ${PARSER_REVISION} has already been reprocessed.`,
    };
  }

  const result = await reprocessDegradedEvents();

  const { error } = await db
    .from("job_config")
    .upsert(
      { key: PARSER_REVISION_KEY, value: String(PARSER_REVISION), updated_at: new Date().toISOString() } as never,
      { onConflict: "key" },
    )
    .select("key")
    .maybeSingle();
  if (error) throw new Error(`recording parser revision failed: ${error.message}`);

  return {
    ran: true,
    revision: PARSER_REVISION,
    previous,
    reason:
      previous === null
        ? `First sweep under parser revision ${PARSER_REVISION}.`
        : `Parser moved from revision ${previous} to ${PARSER_REVISION}.`,
    result,
  };
}
