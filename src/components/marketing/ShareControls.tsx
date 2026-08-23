import { useState } from "react";
import { Check, ClipboardCheck, Image as ImageIcon, Link2, Linkedin, Quote } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  trackIntelligenceShare,
  type SharePlatform,
} from "@/lib/intelligence-telemetry.functions";

/**
 * lucide-react still ships the retired bird as `Twitter`, and the label next to
 * it already says X. Rather than add a brand-icon dependency for one glyph, the
 * X logomark is inlined here, drawn on the same 24-unit grid as the lucide icons
 * beside it so it inherits `currentColor` and the same `h-3.5 w-3.5` sizing.
 */
export function XMark({ className }: { className?: string }) {
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

export const shareLinkClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The four Intelligence share controls, shared by figures and by Notes.
 *
 * Every control fires `intelligence_card_shared` on real activation — never on
 * render — carrying the same stable identifier that is already in the URL it
 * hands to the platform. Telemetry is fire-and-forget: a failed beacon must not
 * stop the share it is observing, so the navigation is never awaited on it.
 */
export function ShareControls({
  cardId,
  title,
  url,
  imageUrl,
  postText,
  className = "",
  copyLabel = "Copy link",
}: {
  cardId: string;
  title: string;
  url: string;
  /** Optional OG image link — figures have one, Notes do not. */
  imageUrl?: string;
  /**
   * Optional ready-to-paste post. Offered where we can state the figure, the
   * window it covers and its source in the same breath, so a reposter cannot
   * accidentally strip the caveat off the number.
   */
  postText?: string;
  className?: string;
  copyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [postCopied, setPostCopied] = useState(false);

  const track = (platform: SharePlatform) => {
    void trackIntelligenceShare({ data: { cardId, platform } }).catch(() => {});
  };

  const enc = encodeURIComponent(url);
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`;
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${enc}`;

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
              data-share-platform="linkedin"
              className={shareLinkClass}
              onClick={() => track("linkedin")}
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
              data-share-platform="x"
              className={shareLinkClass}
              onClick={() => track("x")}
            >
              <XMark className="h-3.5 w-3.5" />
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
              aria-label={copied ? "Link copied" : copyLabel}
              data-share-platform="copy_link"
              data-share-url={url}
              className={shareLinkClass}
              onClick={() => {
                track("copy_link");
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
            <p>{copied ? "Link copied" : copyLabel}</p>
          </TooltipContent>
        </Tooltip>

        {postText ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={postCopied ? "Post copied" : `Copy a ready post: ${title}`}
                data-share-platform="copy_post"
                className={shareLinkClass}
                onClick={() => {
                  track("copy_post");
                  void navigator.clipboard?.writeText(postText).then(() => {
                    setPostCopied(true);
                    setTimeout(() => setPostCopied(false), 2000);
                  });
                }}
              >
                {postCopied ? (
                  <ClipboardCheck className="h-3.5 w-3.5 text-saving" />
                ) : (
                  <Quote className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{postCopied ? "Post copied" : "Copy a ready post with the source line"}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        {imageUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open share image: ${title}`}
                data-share-platform="og_image"
                className={shareLinkClass}
                onClick={() => track("og_image")}
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Open share image</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
