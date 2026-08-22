import { ShareControls } from "@/components/marketing/ShareControls";
import { noteCardId, shareUrl } from "@/lib/intelligence/share-url";
import { useOrigin } from "@/lib/use-origin";


/**
 * Per-note share control.
 *
 * The same four controls the figures carry, minus the OG image link: a note has
 * no frozen share image endpoint of its own. The identifier is the note's slug,
 * prefixed `note-` so a share of an interpretation is never confused with a
 * share of a figure in the event stream — both live in one
 * `intelligence_card_shared` series, and the prefix is what separates them
 * without needing a second event type.
 *
 * Unlike a figure, a note is already permanent: it is code, published once, so
 * the share points at the note's own canonical URL rather than a frozen month.
 */
export function NoteShareButton({
  slug,
  title,
  className = "",
}: {
  slug: string;
  title: string;
  className?: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const origin = hydrated && typeof window !== "undefined" ? window.location.origin : "";
  const cardId = noteCardId(slug);
  const url = shareUrl(origin, `/intelligence/notes/${slug}`, cardId);

  return <ShareControls cardId={cardId} title={title} url={url} className={className} />;
}
