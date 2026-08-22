/**
 * One place that decides what a shared Intelligence URL looks like.
 *
 * Before this, a share pointed at a bare page URL, so an inbound click from a
 * shared link was indistinguishable from a direct visit. Every shared URL now
 * carries the same two-parameter scheme:
 *
 *   ?ref=share&card=<cardId>[#<anchor>]
 *
 * `ref=share` marks the arrival channel; `card` names the exact thing that was
 * shared, using the identifier the page already owns — the anchor id from
 * share-cards.ts for a figure, `note-<slug>` for an Intelligence Note. The hash
 * is preserved and always comes last, because a fragment must terminate the URL.
 *
 * This is the *page* URL only. The OG image endpoint keeps its own `?card=`
 * query semantics untouched — that parameter selects which card the image
 * renders and is not a tracking parameter.
 */

/** The identifier a Note is shared and tracked under. */
export const noteCardId = (slug: string): string => `note-${slug}`;

export function shareUrl(origin: string, path: string, cardId: string, anchor?: string): string {
  const query = `ref=share&card=${encodeURIComponent(cardId)}`;
  const base = `${origin}${path}${path.includes("?") ? "&" : "?"}${query}`;
  return anchor ? `${base}#${anchor}` : base;
}
