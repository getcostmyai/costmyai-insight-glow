import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareControls } from "@/components/marketing/ShareControls";
import { shareUrl } from "@/lib/intelligence/share-url";

/**
 * Per-card share control.
 *
 * A share never points at the live page. It points at the frozen month page and
 * the card's anchor there, because a citation has to keep reading the same in a
 * year. When no month has been frozen yet there is nothing honest to share, so
 * the control is disabled instead of linking to a number that will move.
 *
 * Each platform gets its real share-intent URL, carrying the frozen anchor and
 * the `?ref=share&card=<cardId>` attribution scheme from `share-url.ts`. The
 * crawlers then pull the OG image the same frozen month renders, so the preview
 * and the page can never disagree. The OG endpoint's own `?card=` parameter is
 * unchanged — it selects which card the image draws, and is not tracking.
 */
export function ShareCardButton({
  cardId,
  month,
  title,
  className = "",
}: {
  cardId: string;
  /** The frozen month this card should be cited from, or null if none exists yet. */
  month: string | null;
  title: string;
  className?: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!month) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-disabled="true"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/30 ${className}`}
            >
              <Share2 className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-[16rem]">
              Shareable once this month closes and its figures are frozen.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // The origin is only known in the browser, so it is resolved after hydration.
  // Rendering it during the first paint made the server and client disagree on
  // every share href.
  const origin = hydrated && typeof window !== "undefined" ? window.location.origin : "";
  const url = shareUrl(origin, `/intelligence/${month}`, cardId, cardId);
  const image = `${origin}/api/public/og/intelligence/${month}?card=${encodeURIComponent(cardId)}`;

  return (
    <ShareControls
      cardId={cardId}
      title={title}
      url={url}
      imageUrl={image}
      className={className}
      copyLabel="Copy permanent link"
    />
  );
}
