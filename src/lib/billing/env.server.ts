export type StripeEnvName = "sandbox" | "live";

/**
 * Which payment environment this build's subscriptions live in.
 *
 * Sandbox and live rows share one table, so every plan read has to say which
 * side it means. The answer is taken from the client token baked into the
 * build — the same token checkout itself runs against — so a preview build can
 * never resolve a live subscription and a live build can never be unlocked by
 * a test one. An unrecognised token fails closed to sandbox: paid rungs stay
 * shut rather than opening on a guess.
 */
export function paymentsEnvironment(): StripeEnvName {
  const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
  if (token?.startsWith("pk_live_")) return "live";
  return "sandbox";
}
