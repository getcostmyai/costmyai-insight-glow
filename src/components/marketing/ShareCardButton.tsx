import { ShareControls } from "@/components/marketing/ShareControls";
import type { ShareCitation } from "@/components/marketing/IntelligenceReport";
import { shareUrl } from "@/lib/intelligence/share-url";
import { useOrigin } from "@/lib/use-origin";

/**
 * Per-card share control.
 *
 * A share points at whatever the reader is actually looking at. On a frozen
 * archive page that is the permanent month page and the card's anchor there, so
 * a citation keeps reading the same in a year. On the live page it is the live
 * page itself, labelled honestly as still moving — pointing a live card at last
 * month's archive would share a number that is not on screen.
 *
 * Each platform gets its real share-intent URL, carrying the anchor and the
 * `?ref=share&card=<cardId>` attribution scheme from `share-url.ts`. Crawlers
 * then pull the OG image the matching endpoint renders, so the preview and the
 * page can never disagree. The OG endpoint's own `?card=` parameter is
 * unchanged — it selects which card the image draws, and is not tracking.
 */
export function ShareCardButton({
  cardId,
  citation,
  title,
  postText,
  className = "",
}: {
  cardId: string;
  /** What this card cites: its frozen month, or the live page as of now. */
  citation: ShareCitation;
  title: string;
  /** Optional ready-to-paste post, carrying the figure and its source line. */
  postText?: string;
  className?: string;
}) {
  // Server-resolved, so it is already correct in the first rendered HTML.
  const origin = useOrigin();

  if (citation.kind === "frozen") {
    const url = shareUrl(origin, `/intelligence/${citation.month}`, cardId, cardId);
    const image = `${origin}/api/public/og/intelligence/${citation.month}?card=${encodeURIComponent(cardId)}`;
    return (
      <ShareControls
        cardId={cardId}
        title={title}
        url={url}
        imageUrl={image}
        postText={postText}
        className={className}
        copyLabel="Copy permanent link"
      />
    );
  }

  const url = shareUrl(origin, "/intelligence", cardId, cardId);
  const image = `${origin}/api/public/og/intelligence/live?card=${encodeURIComponent(cardId)}`;
  return (
    <ShareControls
      cardId={cardId}
      title={title}
      url={url}
      imageUrl={image}
      postText={postText}
      className={className}
      copyLabel="Copy link"
    />
  );
}
