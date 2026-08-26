/**
 * The one nav definition the whole product renders from.
 *
 * There used to be two arrays — one in the marketing shell, one in the
 * dashboard shell — and they drifted: the signed-in header still said "Plans"
 * for the same /pricing route and never picked up Blog or the partner page
 * after those shipped. Every surface now reads this list, so a new page is
 * added in exactly one place.
 *
 * `marketingOnly` marks entries that are meaningless once you are signed in —
 * today that is the home-page hash anchor for "How it works".
 */
export type NavItem = {
  to:
    | "/"
    | "/how-it-works"
    | "/models"
    | "/intelligence"
    | "/standard"
    | "/partners"
    | "/blog"
    | "/pricing";
  label: string;
  /** Hash target, for in-page anchors on the marketing home page. */
  hash?: string;
  /** Hidden from the signed-in header. */
  marketingOnly?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/how-it-works", label: "How it works", marketingOnly: true },
  { to: "/models", label: "Models" },
  { to: "/intelligence", label: "Intelligence" },
  { to: "/standard", label: "The Standard", marketingOnly: true },
  { to: "/partners", label: "Become a Partner" },
  { to: "/blog", label: "Blog" },
  { to: "/pricing", label: "Pricing" },
] as const;

/** Public pages: everything. */
export const MARKETING_NAV = NAV_ITEMS;

/** Signed-in header: same list, same order, minus the marketing-only entries. */
export const APP_NAV = NAV_ITEMS.filter((item) => !item.marketingOnly);
