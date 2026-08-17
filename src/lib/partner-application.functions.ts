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

/**
 * Approval with a real side effect: creates the partner account, mints a unique
 * referral code and marks the application approved, in one transaction. The
 * admin check lives inside the database routine, so the argument alone buys
 * nothing. Idempotent — approving twice returns the same partner.
 */
export const approveAndProvisionPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!UUID.test(data?.id ?? "")) throw new Error("Application not found");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "provision_partner_from_application",
      { _application_id: data.id },
    );
    if (error) throw error;
    const provisioned = result as { partner_id: string; referral_code: string; created: boolean };

    // The partner still has to sign up with the exact address they applied
    // with, or claim_partner_membership() silently links nothing. The welcome
    // email is what tells them that. Idempotent, so a re-run does not resend.
    const { sendPartnerWelcome } = await import("./partner-welcome.server");
    const welcome = await sendPartnerWelcome(provisioned.partner_id, { fromApplication: true });

    return { ...provisioned, welcome };
  });


/**
 * Links the signed-in account to a partner account provisioned for the same
 * email address. Identity comes from the session inside the database routine;
 * nothing here is caller-supplied.
 */
export const claimPartnerMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_partner_membership");
    if (error) throw error;
    return { partnerId: (data as string | null) ?? null };
  });

