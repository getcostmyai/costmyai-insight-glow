import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The partner's own profile details.
 *
 * Deliberately not here: bank details, tax forms and identity. Those belong to
 * the payment provider's onboarding and are never duplicated in our database.
 * contact_email is also absent: the claim routine matches a signing-in user to
 * a partner row on that address, so a partner editing it could orphan their own
 * account. The database refuses the change as well, this is not the only guard.
 */

export interface PartnerProfileInput {
  name: string;
  companyName: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

/** Trim, collapse empty strings to null, and refuse anything over the limit. */
function text(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${field} is not valid`);
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) throw new Error(`${field} is too long`);
  return trimmed;
}

export const updateMyPartnerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<PartnerProfileInput>): PartnerProfileInput => {
    const name = text(data?.name, "Name", 120);
    if (!name) throw new Error("Name is required");

    const website = text(data?.website, "Website", 200);
    if (website && !/^https?:\/\/\S+\.\S+/i.test(website)) {
      throw new Error("Website must start with http:// or https://");
    }

    return {
      name,
      companyName: text(data?.companyName, "Company name", 160),
      phone: text(data?.phone, "Phone", 40),
      website,
      addressLine1: text(data?.addressLine1, "Address", 160),
      addressLine2: text(data?.addressLine2, "Address", 160),
      city: text(data?.city, "City", 90),
      postalCode: text(data?.postalCode, "Postal code", 20),
      country: text(data?.country, "Country", 90),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only an owner of the partner account may edit it. RLS enforces the same
    // rule; this read is what tells the caller which row to write.
    const membership = await supabase
      .from("partner_users")
      .select("partner_id, role")
      .eq("user_id", userId)
      .eq("role", "owner")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new Error("Only a partner account owner can edit these details");

    // Exactly the profile columns, never contact_email, code, status or tier.
    const { error } = await supabase
      .from("partners")
      .update({
        name: data.name,
        company_name: data.companyName,
        phone: data.phone,
        website: data.website,
        address_line1: data.addressLine1,
        address_line2: data.addressLine2,
        city: data.city,
        postal_code: data.postalCode,
        country: data.country,
      })
      .eq("id", membership.data.partner_id);
    if (error) throw error;

    return { ok: true as const };
  });
