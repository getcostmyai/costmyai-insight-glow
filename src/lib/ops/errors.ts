/**
 * One honest string for anything that gets thrown.
 *
 * A PostgREST/Supabase failure is a plain object, not an `Error`, so the usual
 * `err instanceof Error ? err.message : String(err)` collapses it to
 * "[object Object]". That is exactly how the schema-filter check sat failing on
 * the ops board for eleven days saying nothing: the real reason (statement
 * timeout, code 57014) was thrown away at the point it was recorded.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [
      typeof e.message === "string" ? e.message : null,
      typeof e.details === "string" && e.details ? e.details : null,
      typeof e.hint === "string" && e.hint ? e.hint : null,
    ].filter(Boolean);
    const body = parts.length > 0 ? parts.join(" — ") : JSON.stringify(err).slice(0, 400);
    return e.code ? `[${String(e.code)}] ${body}` : body;
  }
  return String(err);
}
