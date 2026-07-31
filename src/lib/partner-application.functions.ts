import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isActiveClientBucket,
  isStartingSoonBucket,
  APPLICATION_STATUSES,
  type ApplicationInput,
  type ApplicationStatus,
} from "./partner-application";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Public: anyone can apply. Every field is re-validated server-side and the
 * routing decision is recomputed there — the browser's answer to "do I get a
 * meeting?" is never trusted.
 */
export const submitPartnerApplication = createServerFn({ method: "POST" })
  .inputValidator((data: ApplicationInput) => {
    if (!isActiveClientBucket(data?.activeClients)) throw new Error("Pick your client count");
    if (!isStartingSoonBucket(data?.startingSoon)) throw new Error("Pick a pipeline answer");
    return data;
  })
  .handler(async ({ data }) => {
    const { submitApplication } = await import("./partner-application.server");
    return submitApplication(data);
  });

/** Platform admins only — RLS on `partner_applications` is what enforces it. */
export const listPartnerApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listApplications } = await import("./partner-application.server");
    return listApplications(context.supabase);
  });

export const setPartnerApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: ApplicationStatus; note?: string | null }) => {
    if (!UUID.test(data?.id ?? "")) throw new Error("Application not found");
    if (!APPLICATION_STATUSES.includes(data?.status)) throw new Error("Unknown status");
    const note = (data.note ?? "").trim();
    return { id: data.id, status: data.status, note: note ? note.slice(0, 500) : null };
  })
  .handler(async ({ data, context }) => {
    const { setApplicationStatus } = await import("./partner-application.server");
    await setApplicationStatus(context.supabase, context.userId, data.id, data.status, data.note);
    return { ok: true };
  });
