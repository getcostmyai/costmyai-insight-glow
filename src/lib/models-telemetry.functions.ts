import { createServerFn } from "@tanstack/react-start";

import type { LeadEventType } from "./telemetry/lead-events.server";

/**
 * Model-catalog telemetry.
 *
 * Same transport as `trackPartnerEvent` / `trackIntelligenceShare`: one POST
 * server function into `recordLeadEvent`, which is the single place that
 * resolves `cma_vid` (visitor), `cma_sid` (session) and the referral partner.
 * No new pipeline, no new table.
 *
 * Four distinct events, one per real action:
 *   - `models_page_viewed`  — no payload
 *   - `models_filtered`     — `{ vendor }`, `null` meaning the "All" reset
 *   - `models_sorted`       — `{ sortKey }`, one of the four frozen keys
 *   - `models_searched`     — `{ query }`, free text, sanitized and capped
 *
 * Search is the only free-text field written anywhere in this pipeline, so the
 * validator below is deliberately the narrowest thing that still preserves what
 * a person typed: control characters stripped, whitespace collapsed, hard cap
 * at 200 characters. Anything the validator cannot construct is dropped rather
 * than echoed into `lead_events` — the same refuse-don't-guess rule the
 * Intelligence `cardId` clamp uses.
 */

export const MODEL_SORT_KEYS = ["price", "quality", "spread", "name"] as const;
export type ModelSortKey = (typeof MODEL_SORT_KEYS)[number];

/** Longest search string ever written to `lead_events`. */
export const SEARCH_QUERY_MAX = 200;

/** Vendor labels come from the catalog itself; this bounds the string anyway. */
const VENDOR = /^[\w .+\-/&()~:@]{1,80}$/;

/** Control characters, including the DEL block — never stored. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Sanitize a raw search box value into something safe to store, or `null` when
 * nothing meaningful survives. Over-long input is truncated to
 * `SEARCH_QUERY_MAX` rather than rejected: the leading characters are the real
 * observation, the tail is padding.
 */
export function sanitizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, SEARCH_QUERY_MAX);
}

type ModelsEventInput = {
  event: string;
  vendor?: string | null;
  sortKey?: string;
  query?: string;
};

type Resolved = { event: LeadEventType; payload: unknown } | { event: null; payload: null };

export function resolveModelsEvent(data: ModelsEventInput): Resolved {
  switch (data?.event) {
    case "models_page_viewed":
      return { event: "models_page_viewed", payload: null };

    case "models_filtered": {
      // `null` is the real "All" state and is stored as such — an unrecognised
      // vendor string is dropped to `null` rather than written verbatim.
      const raw = typeof data.vendor === "string" ? data.vendor.trim() : "";
      const vendor = raw && VENDOR.test(raw) ? raw : null;
      return { event: "models_filtered", payload: { vendor } };
    }

    case "models_sorted": {
      if (!MODEL_SORT_KEYS.includes(data.sortKey as ModelSortKey)) {
        return { event: null, payload: null };
      }
      return { event: "models_sorted", payload: { sortKey: data.sortKey as ModelSortKey } };
    }

    case "models_searched": {
      const query = sanitizeSearchQuery(data.query);
      if (query === null) return { event: null, payload: null };
      return { event: "models_searched", payload: { query } };
    }

    default:
      return { event: null, payload: null };
  }
}

export const trackModelsEvent = createServerFn({ method: "POST" })
  .inputValidator((data: ModelsEventInput) => resolveModelsEvent(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.modelsTelemetry, callerIdentity(getRequest()));

    if (!data.event) return { ok: true };

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent(data.event, data.payload);
    return { ok: true };
  });
