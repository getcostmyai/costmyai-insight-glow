import { useEffect, useState } from "react";
import { Check, Image as ImageIcon, Link2, Linkedin, Share2 } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * lucide-react still ships the retired bird as `Twitter`, and the label next to
 * it already says X. Rather than add a brand-icon dependency for one glyph, the
 * X logomark is inlined here, drawn on the same 24-unit grid as the lucide icons
 * beside it so it inherits `currentColor` and the same `h-3.5 w-3.5` sizing.
 */
function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}


/**
 * Per-card share control.
 *
 * A share never points at the live page. It points at the frozen month page and
 * the card's anchor there, because a citation has to keep reading the same in a
 * year. When no month has been frozen yet there is nothing honest to share, so
 * the control is disabled instead of linking to a number that will move.
 *
 * Each platform gets its real share-intent URL, carrying the frozen anchor. The
 * crawlers then pull the OG image the same frozen month renders, so the preview
 * and the page can never disagree.
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
  const [copied, setCopied] = useState(false);
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
  const url = `${origin}/intelligence/${month}#${cardId}`;
  const image = `${origin}/api/public/og/intelligence/${month}?card=${encodeURIComponent(cardId)}`;

  const enc = encodeURIComponent(url);
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`;
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${enc}`;

  const linkBase =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <TooltipProvider delayDuration={0}>
      <div className={`inline-flex items-center gap-0.5 ${className}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={linkedin}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Share on LinkedIn: ${title}`}
              className={linkBase}
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Share on LinkedIn</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={tweet}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Share on X: ${title}`}
              className={linkBase}
            >
              <Twitter className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Share on X</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={copied ? "Link copied" : "Copy permanent link"}
              className={linkBase}
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-saving" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{copied ? "Link copied" : "Copy permanent link"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={image}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open share image: ${title}`}
              className={linkBase}
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Open share image</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
