import { esc, renderSvgToPng } from "@/lib/brand/render.server";
import { createPublicServerClient } from "@/lib/supabase-public.server";

/**
 * Partner badge and LinkedIn banners.
 *
 * The badge is only worth anything because it resolves back to a page CostMyAI
 * controls: the image itself is copyable, the verification URL is not. Every
 * fact drawn into these pixels comes from `partner_badge()`, which returns a
 * row only for a partner whose status is actually `active` — a lapsed,
 * suspended or invented code renders nothing at all.
 */

export interface PartnerBadge {
  code: string;
  name: string;
  tier: number;
  tierName: string;
  ratePct: number;
  joinedAt: string;
}

export const BADGE_CODE_RE = /^[A-Z0-9-]{3,32}$/i;

/** Null for any code that is not an active partner. */
export async function readPartnerBadge(code: string): Promise<PartnerBadge | null> {
  if (!BADGE_CODE_RE.test(code)) return null;
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .rpc("partner_badge", { _code: code })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    code: code.toUpperCase(),
    name: data.partner_name,
    tier: Number(data.tier),
    tierName: data.tier_name,
    ratePct: Number(data.rate_pct),
    joinedAt: data.joined_at,
  };
}

export function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const INK = "#11131D";
const SURFACE = "#171A26";
const PRIMARY = "#7945EC";
const PRIMARY_SOFT = "#A47BF5";
const MUTED = "#9A9BA6";
const PAPER = "#FAFAFC";

/** Truncate on estimated advance width so long names never collide with the edge. */
function fit(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function mark(x: number, y: number, size: number): string {
  const r = size / 2;
  return `<g transform="translate(${x} ${y})">
    <circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>
    <path d="M ${r * 0.62} ${r * 0.68} A ${r * 0.45} ${r * 0.45} 0 1 0 ${r * 0.62} ${r * 1.34}"
      fill="none" stroke="${PAPER}" stroke-width="${Math.max(2, size * 0.09)}" stroke-linecap="round"/>
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${PRIMARY_SOFT}"/>
  </linearGradient>
</defs>`;

/** Square-ish embeddable badge, 600 × 600. */
export function buildBadgeSvg(b: PartnerBadge, verifyUrl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
${DEFS}
<rect width="600" height="600" rx="40" fill="${INK}"/>
<rect x="1" y="1" width="598" height="598" rx="39" fill="none" stroke="${PRIMARY}" stroke-opacity="0.35" stroke-width="2"/>
${mark(252, 74, 96)}
<text x="300" y="238" text-anchor="middle" font-family="Inter" font-size="26" font-weight="600" fill="${PRIMARY_SOFT}" letter-spacing="4">CERTIFIED PARTNER</text>
<text x="300" y="306" text-anchor="middle" font-family="Inter" font-size="46" font-weight="600" fill="${PAPER}">${esc(fit(b.name, 22))}</text>
<text x="300" y="356" text-anchor="middle" font-family="Inter" font-size="30" font-weight="400" fill="${MUTED}">${esc(b.tierName)} tier · since ${esc(joinedLabel(b.joinedAt))}</text>
<rect x="80" y="404" width="440" height="1" fill="#2A2E3E"/>
<text x="300" y="456" text-anchor="middle" font-family="Inter" font-size="26" font-weight="600" fill="${PAPER}">CostMyAI</text>
<text x="300" y="502" text-anchor="middle" font-family="Inter" font-size="20" font-weight="400" fill="${MUTED}">Verify at</text>
<text x="300" y="534" text-anchor="middle" font-family="Inter" font-size="20" font-weight="400" fill="${PRIMARY_SOFT}">${esc(verifyUrl.replace(/^https?:\/\//, ""))}</text>
</svg>`;
}

/**
 * LinkedIn personal profile banner, 1584 × 396 (4:1).
 *
 * LinkedIn drops the circular profile photo over the lower-left of this image;
 * on wide desktop it reaches roughly 400px across and overlaps the bottom edge.
 * Everything readable therefore starts at x = 620 — the whole left third is a
 * deliberate no-text zone, not an accident of layout.
 */
export function buildPersonalBannerSvg(b: PartnerBadge, verifyUrl: string): string {
  const host = verifyUrl.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1584" height="396" viewBox="0 0 1584 396">
${DEFS}
<rect width="1584" height="396" fill="${INK}"/>
<rect x="0" y="0" width="1584" height="396" fill="url(#g)" opacity="0.10"/>
<rect x="560" y="0" width="2" height="396" fill="#2A2E3E"/>
${mark(1424, 40, 56)}
<text x="620" y="128" font-family="Inter" font-size="22" font-weight="600" fill="${PRIMARY_SOFT}" letter-spacing="5">COSTMYAI CERTIFIED PARTNER</text>
<text x="620" y="206" font-family="Inter" font-size="60" font-weight="600" fill="${PAPER}">${esc(fit(b.name, 26))}</text>
<text x="620" y="262" font-family="Inter" font-size="30" font-weight="400" fill="${MUTED}">${esc(b.tierName)} tier · partner since ${esc(joinedLabel(b.joinedAt))}</text>
<text x="620" y="330" font-family="Inter" font-size="24" font-weight="400" fill="${PRIMARY_SOFT}">${esc(host)}</text>
</svg>`;
}

/**
 * LinkedIn company page cover, 4200 × 700 (6:1), which the page renders at
 * about 1128 × 191 and crops in from both sides on narrow layouts. There is no
 * photo overlay here, so the content is centred instead — with roughly a fifth
 * of the width kept clear on each side so a crop never eats the wordmark.
 */
export function buildCompanyBannerSvg(b: PartnerBadge, verifyUrl: string): string {
  const host = verifyUrl.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4200" height="700" viewBox="0 0 4200 700">
${DEFS}
<rect width="4200" height="700" fill="${INK}"/>
<rect x="0" y="0" width="4200" height="700" fill="url(#g)" opacity="0.10"/>
<rect x="900" y="330" width="2400" height="1" fill="#2A2E3E"/>
${mark(2044, 116, 112)}
<text x="2100" y="300" text-anchor="middle" font-family="Inter" font-size="40" font-weight="600" fill="${PRIMARY_SOFT}" letter-spacing="10">COSTMYAI CERTIFIED PARTNER</text>
<text x="2100" y="430" text-anchor="middle" font-family="Inter" font-size="88" font-weight="600" fill="${PAPER}">${esc(fit(b.name, 34))}</text>
<text x="2100" y="500" text-anchor="middle" font-family="Inter" font-size="40" font-weight="400" fill="${MUTED}">${esc(b.tierName)} tier · partner since ${esc(joinedLabel(b.joinedAt))}</text>
<text x="2100" y="580" text-anchor="middle" font-family="Inter" font-size="34" font-weight="400" fill="${PRIMARY_SOFT}">${esc(host)}</text>
</svg>`;
}

export type BannerFormat = "personal" | "company";

export const BANNER_SPEC: Record<BannerFormat, { width: number; height: number; label: string }> = {
  personal: { width: 1584, height: 396, label: "LinkedIn profile banner" },
  company: { width: 4200, height: 700, label: "LinkedIn company page cover" },
};

export function badgeVerifyUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/partner/verify/${code.toUpperCase()}`;
}

export async function renderBadgePng(
  b: PartnerBadge,
  origin: string,
  verifyUrl: string,
): Promise<Uint8Array> {
  return renderSvgToPng(buildBadgeSvg(b, verifyUrl), 600, origin);
}

export async function renderBannerPng(
  b: PartnerBadge,
  format: BannerFormat,
  origin: string,
  verifyUrl: string,
): Promise<Uint8Array> {
  const svg =
    format === "personal"
      ? buildPersonalBannerSvg(b, verifyUrl)
      : buildCompanyBannerSvg(b, verifyUrl);
  return renderSvgToPng(svg, BANNER_SPEC[format].width, origin);
}
