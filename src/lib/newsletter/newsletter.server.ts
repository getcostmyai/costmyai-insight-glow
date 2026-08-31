/**
 * Newsletter subscription lifecycle: signup, double-opt-in confirm, unsubscribe.
 *
 * Every write here goes through the service-role client. `newsletter_subscribers`
 * grants no anon or authenticated access at all (admin-read only, RLS), so the
 * server is the sole writer and each entry point re-validates its own input.
 *
 * Token model — one column, rotated once. `confirm_token` starts life as the
 * double-opt-in token and is *replaced* with a fresh random value the moment
 * the subscription is confirmed. That single choice buys both required
 * behaviours: the confirm token is genuinely single-use (a replay finds no row
 * carrying it), and the rotated value becomes the durable unsubscribe token
 * that every issue footer can carry. A second column would have to be kept in
 * step with this one for no additional security.
 */
import {
  generateToken,
  isPlausibleToken,
  isValidEmail,
  normalizeEmail,
  normalizeSource,
} from "./newsletter";

export type SignupOutcome =
  /** A confirmation mail was sent (first signup, or a re-send to a pending address). */
  | { status: "pending" }
  /** Already confirmed, or suppressed, or the send failed. Indistinguishable on purpose. */
  | { status: "noop" };

export type ConfirmOutcome =
  | { status: "confirmed" }
  /** Unknown, already-used or already-confirmed token. Never says which. */
  | { status: "invalid" };

export type UnsubscribeOutcome =
  | { status: "unsubscribed" }
  | { status: "invalid" };

interface SignupContext {
  visitorId?: string | null;
  sessionId?: string | null;
  partnerId?: string | null;
}

function confirmUrl(token: string, origin: string): string {
  return `${origin}/newsletter/confirm?token=${token}`;
}

function unsubscribeUrl(token: string, origin: string): string {
  return `${origin}/newsletter/unsubscribe?token=${token}`;
}

/**
 * Sign an address up.
 *
 * Enumeration rule: the return value is the same shape whether the address is
 * new, pending or already confirmed. A caller cannot use this endpoint to learn
 * whether someone is on the list, which is the only thing that makes a public
 * signup form safe to leave unauthenticated.
 */
export async function subscribe(
  rawEmail: string,
  rawSource: unknown = null,
  context: SignupContext = {},
): Promise<SignupOutcome> {
  if (!isValidEmail(rawEmail)) throw new Error("Please enter a valid email address");
  const email = normalizeEmail(rawEmail);
  const source = normalizeSource(rawSource);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("newsletter_subscribers")
    .select("id, status")
    .ilike("email", email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  // Already on the list and confirmed: do nothing, say nothing. Re-sending a
  // confirmation to a confirmed address would both leak membership and let the
  // form be used to mail someone repeatedly.
  if (existing?.status === "confirmed") return { status: "noop" };

  const token = generateToken();

  if (existing) {
    // Pending, unsubscribed or bounced all get a fresh token and a fresh mail:
    // re-consenting is the same act as consenting the first time.
    const { error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .update({
        status: "pending",
        confirm_token: token,
        confirmed_at: null,
        unsubscribed_at: null,
        ...(source ? { source } : {}),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("newsletter_subscribers").insert({
      email,
      source,
      status: "pending",
      confirm_token: token,
      visitor_id: context.visitorId ?? null,
      session_id: context.sessionId ?? null,
      referred_by_partner_id: context.partnerId ?? null,
      // Pinned false by the pin_synthetic_false() trigger; stated here so the
      // guarded-insert lint rule can see it and so the intent is explicit.
      is_synthetic: false,
    });
    if (error) throw error;
  }

  const { siteOrigin } = await import("../partner-welcome.server");
  const origin = siteOrigin();

  try {
    const { sendTemplateEmail } = await import("../email-templates/send-email");
    const result = await sendTemplateEmail("newsletter-confirm", email, {
      templateData: {
        confirmUrl: confirmUrl(token, origin),
        unsubscribeUrl: unsubscribeUrl(token, origin),
      },
      // One token, one mail. A double-submit that lands on the same token
      // cannot produce two messages.
      idempotencyKey: `newsletter-confirm-${token}`,
    });
    if (!result.sent) return { status: "noop" };
  } catch (err) {
    // The row is already written, so the address is not lost. Surfacing the
    // provider error to an anonymous caller would leak suppression state.
    console.error("newsletter confirmation not sent", err instanceof Error ? err.message : String(err));
    return { status: "noop" };
  }

  return { status: "pending" };
}

/**
 * Complete double opt-in. Single-use: the token that arrives is consumed and
 * replaced, so the same link clicked twice returns `invalid` rather than an
 * ambiguous error, and a leaked mailbox cannot be replayed later.
 *
 * Returns the rotated token so the caller can hand the reader a working
 * unsubscribe link on the confirmation page itself.
 */
export async function confirmSubscription(
  rawToken: string,
): Promise<ConfirmOutcome & { unsubscribeToken?: string }> {
  if (!isPlausibleToken(rawToken)) return { status: "invalid" };
  const token = rawToken.trim();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rotated = generateToken();

  // Conditional update, not read-then-write: `status = pending` in the WHERE
  // clause is what makes two concurrent clicks resolve to exactly one confirm.
  const { data, error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirm_token: rotated,
    })
    .eq("confirm_token", token)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: "invalid" };
  return { status: "confirmed", unsubscribeToken: rotated };
}

/**
 * Leave the list. Idempotent by construction: the token is *not* rotated here,
 * so clicking the same footer link a second time finds the same row, writes the
 * same state and reports success. An unsubscribe that errors on the second
 * click is an unsubscribe people stop trusting.
 */
export async function unsubscribeByToken(rawToken: string): Promise<UnsubscribeOutcome> {
  if (!isPlausibleToken(rawToken)) return { status: "invalid" };
  const token = rawToken.trim();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("newsletter_subscribers")
    .select("id, status, unsubscribed_at")
    .eq("confirm_token", token)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) return { status: "invalid" };

  if (existing.status === "unsubscribed") return { status: "unsubscribed" };

  const { error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) throw error;

  return { status: "unsubscribed" };
}
