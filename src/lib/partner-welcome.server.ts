/**
 * Partner welcome email.
 *
 * The one thing this email exists to prevent is a partner signing up with the
 * wrong address: `claim_partner_membership()` matches on the exact, confirmed
 * email of the partner row, and a mismatch fails silently. So the send is
 * driven off the stored `contact_email` and nothing else — the address the
 * partner is told to use is, by construction, the address that will link.
 *
 * A failed send never breaks partner creation. The caller gets the reason back
 * and shows it, so the gap is visible rather than silent.
 */

export interface PartnerWelcomeResult {
  sent: boolean;
  /** Null when sent; a human-readable reason otherwise. */
  reason: string | null;
  email: string | null;
}

// There is deliberately no siteOrigin() here any more. It read an environment
// variable that was never set in any environment and fell back to a preview
// host, so every link it built landed in a real inbox pointing at the wrong
// domain. Outbound links come from src/lib/email-links.ts and nowhere else.

export async function sendPartnerWelcome(
  partnerId: string,
  options: { fromApplication?: boolean } = {},
): Promise<PartnerWelcomeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: partner, error } = await supabaseAdmin
    .from("partners")
    .select("id, name, contact_email, referral_code, status")
    .eq("id", partnerId)
    .maybeSingle();

  if (error) return { sent: false, reason: error.message, email: null };
  if (!partner) return { sent: false, reason: "Partner not found", email: null };

  const email = (partner.contact_email ?? "").trim().toLowerCase();
  if (!email) {
    return { sent: false, reason: "Partner has no contact email", email: null };
  }

  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const { partnerLoginUrl, partnerReferralUrl } = await import("./email-links");
    const result = await sendTemplateEmail("partner-welcome", email, {
      templateData: {
        partnerName: partner.name,
        signInEmail: email,
        referralCode: partner.referral_code,
        referralLink: partnerReferralUrl(partner.referral_code),
        loginUrl: partnerLoginUrl(),
        fromApplication: options.fromApplication ?? false,
      },
      // One welcome per partner account, whatever path created it: a retried
      // approval or a re-run admin action will not send a second copy.
      idempotencyKey: `partner-welcome-${partner.id}`,
      replyTo: "mail@costmyai.com",
    });

    if (!result.sent) {
      return {
        sent: false,
        reason: "This address has bounced, complained or unsubscribed previously",
        email,
      };
    }
    return { sent: true, reason: null, email };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Email send failed",
      email,
    };
  }
}
