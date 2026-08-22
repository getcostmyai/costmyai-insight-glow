import { createServerFn } from "@tanstack/react-start";

import {
  isActiveClientBucket,
  isStartingSoonBucket,
} from "./partner-application";
import type { LeadEventType } from "./telemetry/lead-events.server";

/**
 * Partner funnel telemetry.
 *
 * Same transport as the estimator's `trackEstimatorEvent`: one POST server
 * function into `recordLeadEvent`, which is what mints `cma_vid`/`cma_sid` and
 * resolves the referral partner. No new pipeline.
 *
 * PII boundary: the validator below is the only thing that can put a payload on
 * a partner event, and it can construct exactly one shape — `{ step, value }`
 * where `value` is one of the frozen bucket enums from `partner-application.ts`.
 * A caller-supplied object is never forwarded, so step 3's contact fields
 * (firstName, lastName, email, phone, company) have no path into `lead_events`
 * even if the browser tried to send them.
 */
const ALLOWED: LeadEventType[] = [
  "partner_page_viewed",
  "partner_apply_started",
  "partner_apply_step_completed",
];

type PartnerEventInput = {
  event: LeadEventType;
  step?: 1 | 2;
  value?: string;
};

export const trackPartnerEvent = createServerFn({ method: "POST" })
  .inputValidator((data: PartnerEventInput) => {
    const event = (
      ALLOWED.includes(data?.event) ? data.event : "partner_page_viewed"
    ) as LeadEventType;

    if (event !== "partner_apply_step_completed") {
      return { event, payload: null as unknown };
    }

    // Step completion carries the bucket answer and nothing else. An answer
    // that is not a member of its own enum is dropped rather than echoed back
    // into the table as free text.
    const step = data?.step === 2 ? 2 : 1;
    const value = typeof data?.value === "string" ? data.value : "";
    const valid = step === 1 ? isActiveClientBucket(value) : isStartingSoonBucket(value);
    return { event, payload: valid ? ({ step, value } as unknown) : ({ step } as unknown) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.partnerTelemetry, callerIdentity(getRequest()));

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent(data.event, data.payload);
    return { ok: true };
  });
