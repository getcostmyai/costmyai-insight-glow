/**
 * Once-ever suppression logic for the newsletter slide-in.
 *
 * Pure functions over an explicit state object, so the rules can be tested
 * without a browser. The browser adapters at the bottom are the only part that
 * touches localStorage or document.cookie, and both are wrapped: a locked-down
 * storage must never crash a marketing page, and when we cannot read the state
 * we err on the side of NOT nagging.
 */

export const PROMPT_STORAGE_KEY = "costmyai.newsletter";
export const PROMPT_COOKIE = "cma_nl";
/** One year: the prompt is a once-ever thing, the cookie only mirrors that. */
export const PROMPT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type PromptState = {
  /** The visitor closed the card without subscribing. */
  dismissed: boolean;
  /** The visitor subscribed anywhere on the site — outranks dismissal. */
  subscribed: boolean;
};

export const EMPTY_PROMPT_STATE: PromptState = { dismissed: false, subscribed: false };

/**
 * Where the slide-in is allowed at all. An allow list, not a deny list: a new
 * route (a checkout step, a workspace screen) must never inherit the prompt by
 * accident just because nobody remembered to add it to a blocked list.
 */
const ALLOWED_PREFIXES = ["/intelligence", "/blog", "/reports", "/guides"];

/**
 * Explicitly blocked even if a future allowed prefix would cover them. Present
 * for the day someone adds "/p" or similar and quietly captures /pricing.
 */
const BLOCKED_PREFIXES = ["/pricing", "/auth", "/partners", "/workspace", "/admin", "/billing", "/demo"];

function normalize(pathname: string): string {
  const path = (pathname || "/").split("?")[0]!.split("#")[0]!;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isPromptEligiblePath(pathname: string): boolean {
  const path = normalize(pathname);
  if (matches(path, BLOCKED_PREFIXES)) return false;
  return matches(path, ALLOWED_PREFIXES);
}

/** The whole rule in one place: route allowed, never dismissed, never subscribed. */
export function shouldShowPrompt(pathname: string, state: PromptState): boolean {
  if (state.subscribed) return false;
  if (state.dismissed) return false;
  return isPromptEligiblePath(pathname);
}

/* --------------------------- browser adapters --------------------------- */

function readCookieFlag(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${PROMPT_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(PROMPT_COOKIE.length + 1)) : null;
}

function writeCookieFlag(value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PROMPT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${PROMPT_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Two stores, deliberately. localStorage survives cookie clearing in some
 * browsers; the cookie survives storage partitioning in others. Either one
 * saying "seen" is enough — the union is what makes this once-ever rather than
 * once-per-storage-quirk.
 */
export function readPromptState(): PromptState {
  const state = { ...EMPTY_PROMPT_STATE };
  const cookie = readCookieFlag();
  if (cookie === "dismissed") state.dismissed = true;
  if (cookie === "subscribed") state.subscribed = true;

  try {
    const raw = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PromptState>;
      if (parsed.dismissed) state.dismissed = true;
      if (parsed.subscribed) state.subscribed = true;
    }
  } catch {
    /* private mode or blocked storage: the cookie above still applies */
  }
  return state;
}

function persist(state: PromptState): void {
  try {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  writeCookieFlag(state.subscribed ? "subscribed" : "dismissed");
}

export function markPromptDismissed(): void {
  const state = readPromptState();
  persist({ ...state, dismissed: true });
}

/** Called from every signup form, not just the slide-in: subscribing anywhere ends the nagging. */
export function markSubscribed(): void {
  const state = readPromptState();
  persist({ ...state, subscribed: true });
}
