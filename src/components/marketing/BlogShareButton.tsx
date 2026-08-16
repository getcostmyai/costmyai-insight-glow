import { useEffect, useState } from "react";
import { Check, Link2, Linkedin } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Inlined X logomark on the same 24-unit grid as lucide icons so it inherits
 * currentColor and the same h-3.5 w-3.5 sizing. Matches ShareCardButton.tsx.
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
 * Per-post share control for blog articles.
 *
 * Mirrors ShareCardButton visually but is scoped to a post slug/title and
 * offers only LinkedIn, X, and copy-link — no frozen-month share-image flow.
 */
export function BlogShareButton({
  slug,
  title,
  className = "",
}: {
  slug: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const origin = hydrated && typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/blog/${slug}`;
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
              aria-label={copied ? "Link copied" : "Copy link"}
              className={linkBase}
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCoppied(true);
                  setTimeout(() => setCoppied(false), 2000);
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
            <p>{copied ? "Link copied" : "Copy link"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
