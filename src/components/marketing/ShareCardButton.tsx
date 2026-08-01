import { useState } from "react";
import { Check, Image as ImageIcon, Link2, Linkedin, Share2, Twitter } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  if (!month) {
    return (
      <span
        aria-disabled="true"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/30 ${className}`}
        title="Shareable once this month closes and its figures are frozen"
      >
        <Share2 className="h-4 w-4" />
      </span>
    );
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/intelligence/${month}#${cardId}`;
  const image = `${origin}/api/public/og/intelligence/${month}?card=${encodeURIComponent(cardId)}`;
  const enc = encodeURIComponent(url);
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${enc}`;
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${enc}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Share: ${title}`}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        {copied ? <Check className="h-4 w-4 text-saving" /> : <Share2 className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Links to the frozen {month} figure — this number can never move.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={linkedin} target="_blank" rel="noreferrer noopener">
            <Linkedin className="mr-2 h-4 w-4" />
            Share on LinkedIn
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={tweet} target="_blank" rel="noreferrer noopener">
            <Twitter className="mr-2 h-4 w-4" />
            Share on X
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          <Link2 className="mr-2 h-4 w-4" />
          {copied ? "Link copied" : "Copy permanent link"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={image} target="_blank" rel="noreferrer noopener">
            <ImageIcon className="mr-2 h-4 w-4" />
            Open share image
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
