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

/**
 * The code alphabet, and why it looks like this.
 *
 * A referral code must never carry the partner's name: a recipient who reads
 * SLAEPPLE09 knows the sender is paid before they have looked at anything, and
 * the neutral-recommendation position the partner relies on is gone. So the
 * code is random, not derived.
 *
 * Excluded characters are the ones that break when a code is read aloud on a
 * call or retyped off a slide: O, 0, I, 1, L. Randomness comes from
 * crypto.getRandomValues, never Math.random.
 */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

export function generateReferralCode(): string {
  const bytes = new Uint32Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[bytes[i]! % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
}

type Admin = SupabaseClient<Database>;

/**
 * Unique or nothing. A collision retries; exhausting the retries throws rather
 * than handing back a code that is already in use.
 */
export async function mintReferralCode(supabaseAdmin: Admin): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = generateReferralCode();
    const { data, error } = await supabaseAdmin
      .from("partners")
      .select("id")
      .ilike("referral_code", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not mint a unique referral code after 25 attempts");
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

  // No caller-chosen codes: a hand-picked code is how name-derived codes come
  // back. Every partner gets a neutral random one.
  const referralCode = await mintReferralCode(admin);

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

/**
 * Reissue a partner's referral code.
 *
 * The admin check runs here, against the caller's own client, before the
 * database routine is reached, so a non-admin cannot even learn whether a
 * partner id exists. The routine itself re-checks and writes the audit row.
 */
export async function reissueCode(
  supabase: Admin,
  partnerId: string,
  reason?: string,
): Promise<{ partner_id: string; previous_code: string; referral_code: string }> {
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_platform_admin");
  if (adminError) throw adminError;
  if (!isAdmin) throw new Error("Not found");

  const { data, error } = await supabase.rpc("reissue_referral_code", {
    _partner_id: partnerId,
    _reason: reason,
  });
  if (error) throw error;
  return data as unknown as { partner_id: string; previous_code: string; referral_code: string };
}
