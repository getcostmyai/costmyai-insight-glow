import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sendPartnerWelcome, type PartnerWelcomeResult } from "./partner-welcome.server";

/**
 * Creating a partner by hand.
 *
 * This replaces raw service-role SQL for partner creation. Doing it as an app
 * action rather than a database trigger is deliberate: a trigger on `partners`
 * would also fire for seeds and fixtures, and it would fire while the row is
 * still `pending`, before `claim_partner_membership()` would link anything.
 * Here the row is written active, the email is normalized to the exact string
 * the claim routine matches on, and the welcome email goes out in the same step.
 */

export interface CreatePartnerInput {
  name: string;
  email: string;
  referralCode?: string | null;
  /** Set after the caller has seen and accepted the duplicate warning. */
  allowDuplicate?: boolean;
}

export interface CreatePartnerResult {
  partnerId: string;
  referralCode: string;
  email: string;
  welcome: PartnerWelcomeResult;
}

export class DuplicatePartnerError extends Error {
  constructor(public existing: { id: string; name: string; referralCode: string }) {
    super(
      `An active partner already uses this email: ${existing.name} (${existing.referralCode}). Create anyway only if this is intentional.`,
    );
    this.name = "DuplicatePartnerError";
  }
}

export function normalizePartnerEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

export function deriveReferralCode(name: string): string {
  const base = (name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return base.length >= 3 ? base : `PARTNER${Math.floor(Math.random() * 9000 + 1000)}`;
}

type Admin = SupabaseClient<Database>;

async function uniqueCode(supabaseAdmin: Admin, seed: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? seed : `${seed.slice(0, 10)}${attempt + 1}`;
    const { data } = await supabaseAdmin
      .from("partners")
      .select("id")
      .ilike("referral_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${seed.slice(0, 8)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export async function createPartnerAndWelcome(
  input: CreatePartnerInput,
  createdBy: string,
): Promise<CreatePartnerResult> {
  const name = (input.name ?? "").trim();
  const email = normalizePartnerEmail(input.email);
  if (!name) throw new Error("Partner name is required");
  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid contact email is required");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;

  const { data: existing, error: existingError } = await admin
    .from("partners")
    .select("id, name, referral_code")
    .eq("contact_email", email)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && !input.allowDuplicate) {
    throw new DuplicatePartnerError({
      id: existing.id,
      name: existing.name,
      referralCode: existing.referral_code,
    });
  }

  const requested = (input.referralCode ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const referralCode = await uniqueCode(
    admin,
    requested.length >= 3 ? requested : deriveReferralCode(name),
  );

  const { data: created, error } = await admin
    .from("partners")
    .insert({
      name,
      contact_email: email,
      referral_code: referralCode,
      status: "active",
      created_by: createdBy,
    })
    .select("id, referral_code")
    .single();
  if (error) throw error;

  const welcome = await sendPartnerWelcome(created.id, { fromApplication: false });

  return { partnerId: created.id, referralCode: created.referral_code, email, welcome };
}
