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

/*
 * Brand surface, one set of values.
 *
 * These are the live product's own tokens, not a badge-only palette: warm white
 * paper, near-black ink, indigo as the single accent. Inter carries every
 * label; JetBrains Mono carries the verification URL, exactly the way the
 * product treats identifiers everywhere else. Restraint is the point — a
 * consultant should be able to put this next to a Stripe or Vercel mark without
 * it looking louder.
 */
const PAPER = "#FAFAF9";
const INK = "#14131A";
const INDIGO = "#4338CA";
const INDIGO_WASH = "#EEF0FE";
const HAIRLINE = "#E4E2DE";
const MUTED = "#6B6A76";

/** Rough advance width for Inter at a weight of 500–600, good enough for layout. */
const advance = (text: string, size: number) => text.length * size * 0.52;

/**
 * Names are set as large as the column allows and only shrink when they must,
 * so "Kai Ng" and "Vincent Weber Consulting" both sit on one confident line
 * instead of one of them being cut with an ellipsis at a fixed character count.
 */
function fitName(text: string, maxWidth: number, maxSize: number, minSize: number) {
  const size = Math.max(minSize, Math.min(maxSize, maxWidth / (text.length * 0.52)));
  const maxChars = Math.floor(maxWidth / (size * 0.52));
  const label = text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
  return { label, size };
}

/**
 * The mark: a solid indigo square with the product's rounded corner radius and
 * a single warm-white arc, the same glyph the wordmark sits beside in-app.
 */
function mark(x: number, y: number, size: number): string {
  const s = size;
  return `<g transform="translate(${x} ${y})">
    <rect width="${s}" height="${s}" rx="${s * 0.28}" fill="${INDIGO}"/>
    <path d="M ${s * 0.66} ${s * 0.34} A ${s * 0.22} ${s * 0.22} 0 1 0 ${s * 0.66} ${s * 0.66}"
      fill="none" stroke="${PAPER}" stroke-width="${Math.max(2, s * 0.1)}" stroke-linecap="round"/>
  </g>`;
}

/**
 * Mark plus "CostMyAI" wordmark ("My" in indigo), placed as one lockup so the
 * pair is optically centred or right-aligned rather than the text drifting off
 * the canvas edge.
 */
function lockup(opts: {
  size: number;
  baseline: number;
  align: "center" | "right";
  at: number;
}): string {
  const { size, baseline, align, at } = opts;
  const glyph = size * 1.34;
  const gap = size * 0.5;
  const textW = advance("CostMyAI", size) * 1.02;
  const total = glyph + gap + textW;
  const left = align === "center" ? at - total / 2 : at - total;
  return `${mark(left, baseline - glyph * 0.82, glyph)}
<text x="${left + glyph + gap}" y="${baseline}" font-family="Inter" font-size="${size}" font-weight="600" fill="${INK}" letter-spacing="${-size * 0.02}">Cost<tspan fill="${INDIGO}">My</tspan>AI</text>`;
}

function tierChip(cx: number, cy: number, size: number, label: string): string {
  const w = advance(label, size) + size * 2.4;
  const h = size * 2.1;
  return `<g>
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${INDIGO_WASH}"/>
    <text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" font-family="Inter" font-size="${size}" font-weight="600" fill="${INDIGO}" letter-spacing="${size * 0.02}">${esc(label)}</text>
  </g>`;
}


const DEFS = `<defs>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${INDIGO}" stop-opacity="0"/>
    <stop offset="0.5" stop-color="${INDIGO}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="${INDIGO}" stop-opacity="0"/>
  </linearGradient>
</defs>`;

/** Square embeddable badge, 600 × 600. */
export function buildBadgeSvg(b: PartnerBadge, verifyUrl: string): string {
  const host = verifyUrl.replace(/^https?:\/\//, "");
  const name = fitName(b.name, 452, 46, 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
${DEFS}
<rect width="600" height="600" rx="36" fill="${PAPER}"/>
<rect x="0.75" y="0.75" width="598.5" height="598.5" rx="35.25" fill="none" stroke="${HAIRLINE}" stroke-width="1.5"/>
<rect x="36" y="0" width="528" height="3" fill="url(#rule)"/>
${lockup({ size: 28, baseline: 104, align: "center", at: 300 })}
<rect x="88" y="160" width="424" height="1" fill="${HAIRLINE}"/>
<text x="300" y="226" text-anchor="middle" font-family="Inter" font-size="19" font-weight="600" fill="${INDIGO}" letter-spacing="6.5">CERTIFIED PARTNER</text>
<text x="300" y="${306 + (46 - name.size) * 0.4}" text-anchor="middle" font-family="Inter" font-size="${name.size}" font-weight="600" fill="${INK}" letter-spacing="-1.2">${esc(name.label)}</text>
${tierChip(300, 360, 20, `${b.tierName} · partner since ${joinedLabel(b.joinedAt)}`)}
<rect x="88" y="436" width="424" height="1" fill="${HAIRLINE}"/>
<text x="300" y="484" text-anchor="middle" font-family="Inter" font-size="14" font-weight="600" fill="${MUTED}" letter-spacing="4">VERIFY THIS BADGE</text>
<text x="300" y="522" text-anchor="middle" font-family="JetBrains Mono" font-size="19" font-weight="400" fill="${INK}">${esc(host)}</text>
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
  const name = fitName(b.name, 700, 58, 34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1584" height="396" viewBox="0 0 1584 396">
${DEFS}
<rect width="1584" height="396" fill="${PAPER}"/>
<rect x="0" y="0" width="1584" height="4" fill="url(#rule)"/>
<rect x="0" y="392" width="1584" height="4" fill="url(#rule)"/>
<rect x="560" y="96" width="1" height="204" fill="${HAIRLINE}"/>
${lockup({ size: 26, baseline: 76, align: "right", at: 1500 })}
<text x="620" y="132" font-family="Inter" font-size="19" font-weight="600" fill="${INDIGO}" letter-spacing="6.5">CERTIFIED PARTNER</text>
<text x="620" y="${210 + (58 - name.size) * 0.4}" font-family="Inter" font-size="${name.size}" font-weight="600" fill="${INK}" letter-spacing="-1.6">${esc(name.label)}</text>
<text x="620" y="262" font-family="Inter" font-size="26" font-weight="400" fill="${MUTED}">${esc(b.tierName)} · partner since ${esc(joinedLabel(b.joinedAt))}</text>
<text x="620" y="330" font-family="JetBrains Mono" font-size="22" font-weight="400" fill="${INK}">${esc(host)}</text>
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
  const name = fitName(b.name, 1500, 88, 52);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="4200" height="700" viewBox="0 0 4200 700">
${DEFS}
<rect width="4200" height="700" fill="${PAPER}"/>
<rect x="0" y="0" width="4200" height="6" fill="url(#rule)"/>
<rect x="0" y="694" width="4200" height="6" fill="url(#rule)"/>
${lockup({ size: 40, baseline: 152, align: "center", at: 2100 })}
<rect x="1500" y="216" width="1200" height="1" fill="${HAIRLINE}"/>
<text x="2100" y="290" text-anchor="middle" font-family="Inter" font-size="30" font-weight="600" fill="${INDIGO}" letter-spacing="11">CERTIFIED PARTNER</text>
<text x="2100" y="${408 + (88 - name.size) * 0.4}" text-anchor="middle" font-family="Inter" font-size="${name.size}" font-weight="600" fill="${INK}" letter-spacing="-2.4">${esc(name.label)}</text>
<text x="2100" y="476" text-anchor="middle" font-family="Inter" font-size="36" font-weight="400" fill="${MUTED}">${esc(b.tierName)} · partner since ${esc(joinedLabel(b.joinedAt))}</text>
<text x="2100" y="584" text-anchor="middle" font-family="JetBrains Mono" font-size="32" font-weight="400" fill="${INK}">${esc(host)}</text>
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
