import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Platform admins only. The admin check runs here and the write runs with
 * service credentials, so `partners` never has to be writable by a signed-in
 * client.
 */
export const createPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; email: string; allowDuplicate?: boolean }) => {
    const name = (data?.name ?? "").trim();
    const email = (data?.email ?? "").trim().toLowerCase();
    if (!name) throw new Error("Partner name is required");
    if (!email) throw new Error("A contact email is required");
    return {
      name: name.slice(0, 120),
      email: email.slice(0, 200),
      allowDuplicate: data?.allowDuplicate === true,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    if (!isAdmin) throw new Error("Not found");

    const { createPartnerAndWelcome, DuplicatePartnerError } = await import(
      "./partner-create.server"
    );
    try {
      const result = await createPartnerAndWelcome(data, context.userId);
      return { ...result, duplicate: false as const };
    } catch (err) {
      if (err instanceof DuplicatePartnerError) {
        // Not an error the admin cannot get past — a warning they must accept.
        return { duplicate: true as const, message: err.message, existing: err.existing };
      }
      throw err;
    }
  });

/** Re-send the welcome email for an existing partner account. */
export const resendPartnerWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partnerId: string }) => {
    if (!UUID.test(data?.partnerId ?? "")) throw new Error("Partner not found");
    return { partnerId: data.partnerId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    if (!isAdmin) throw new Error("Not found");

    const { sendPartnerWelcome } = await import("./partner-welcome.server");
    return sendPartnerWelcome(data.partnerId, { fromApplication: false });
  });

/**
 * Reissue a partner's referral code. Platform admins only.
 *
 * Exists so retiring a code is never a founder-run database update again. The
 * new code is minted in the database routine, the old one is written to
 * partner_code_audit with the actor, and partners cannot reach this at all.
 */
export const reissuePartnerCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partnerId: string; reason?: string }) => {
    if (!UUID.test(data?.partnerId ?? "")) throw new Error("Partner not found");
    const reason = (data?.reason ?? "").trim();
    return { partnerId: data.partnerId, reason: reason ? reason.slice(0, 300) : undefined };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Not found");

    const { data: result, error } = await context.supabase.rpc("reissue_referral_code", {
      _partner_id: data.partnerId,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return result as { partner_id: string; previous_code: string; referral_code: string };
  });
