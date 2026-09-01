/**
 * The newsletter's markdown dialect.
 *
 * Deliberately tiny and dependency-free. An issue is a weekly briefing, not a
 * CMS: headings, paragraphs, lists, quotes, rules, and inline emphasis/links
 * cover everything a written issue has ever needed. Anything richer would
 * survive the composer and then break in Outlook.
 *
 * The parser produces a block tree rather than an HTML string on purpose. The
 * email template renders that tree with React Email components, and the admin
 * preview renders the *same template* server-side, so there is exactly one
 * definition of what an issue looks like. No second "preview format" exists to
 * drift away from what subscribers receive.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type ChartKind = "bars" | "spread" | "scatter";

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  note?: string;
  /** Raw `A:1|B:2` payload, kind-specific. Frozen into the image URL. */
  data: string;
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; spans: Inline[] }
  | { kind: "chart"; chart: ChartSpec }
  | { kind: "rule" };

export const CHART_KINDS: ChartKind[] = ["bars", "spread", "scatter"];

/** Canvas width every chart is drawn at; the email displays it at half size. */
export const CHART_WIDTH = 1040;

/** `Label:1:2|Other:3:4` into trimmed parts. A malformed row is dropped rather
 * than failing the whole image: one typo must not blank an issue. */
export function parseChartRows(data: string): string[][] {
  return data
    .split("|")
    .map((entry) => entry.split(":").map((part) => part.trim()))
    .filter((parts) => (parts[0] ?? "").length > 0);
}

/**
 * Canvas height, defined here rather than in the renderer so the email can
 * reserve the exact space before the image loads. Both sides read this.
 */
export function chartPixelHeight(spec: ChartSpec): number {
  const count = Math.max(parseChartRows(spec.data).length, 1);
  if (spec.kind === "scatter") return 620;
  if (spec.kind === "spread") return 110 + Math.min(count, 5) * 92 + (spec.note ? 52 : 24);
  return 108 + Math.min(count, 6) * 62 + (spec.note ? 62 : 30);
}

/** Absolute, self-contained image URL. Every number lives in the query string,
 * so a sent issue renders the same chart forever with no database lookup. */
export function chartImageUrl(spec: ChartSpec, origin: string): string {
  const params = new URLSearchParams({ kind: spec.kind, title: spec.title, data: spec.data });
  if (spec.note) params.set("note", spec.note);
  return `${origin.replace(/\/$/, "")}/api/public/og/newsletter/chart.png?${params.toString()}`;
}

/** Readable description for alt text and for clients that block images. */
export function chartAltText(spec: ChartSpec): string {
  const rows = parseChartRows(spec.data)
    .map((parts) => parts.join(" "))
    .join("; ");
  return `${spec.title}. ${rows}`.trim();
}

/**
 * `::chart kind=bars title="Biggest drops" data="A:-40|B:-12" note="..."`
 *
 * Returns null for anything malformed, and the caller then keeps the line as
 * plain text. A typo in a directive must degrade to visible words the editor
 * can fix, never to a silently missing section.
 */
export function parseChartDirective(line: string): ChartSpec | null {
  const trimmed = line.trim();
  if (!/^::chart\b/i.test(trimmed)) return null;

  const attrs: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match = pattern.exec(trimmed);
  while (match) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    match = pattern.exec(trimmed);
  }

  const kind = (attrs["kind"] ?? "").toLowerCase() as ChartKind;
  const data = attrs["data"] ?? "";
  if (!CHART_KINDS.includes(kind)) return null;
  if (parseChartRows(data).length === 0) return null;

  const spec: ChartSpec = {
    kind,
    title: (attrs["title"] ?? "").slice(0, 90),
    data: data.slice(0, 600),
  };
  const note = (attrs["note"] ?? "").slice(0, 140);
  if (note) spec.note = note;
  return spec;
}


/** Only http(s) and mailto survive. A markdown link is author-controlled, but
 * `javascript:` in a rendered preview iframe is still not something to allow. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href)) return href;
  return null;
}

const INLINE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)|(_[^_]+_)/;

export function parseInline(source: string): Inline[] {
  const spans: Inline[] = [];
  let rest = source;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      spans.push({ text: rest });
      break;
    }
    if (match.index > 0) spans.push({ text: rest.slice(0, match.index) });
    const token = match[0];

    if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = safeHref(token.slice(split + 2, -1));
      // An unsafe target degrades to plain text rather than vanishing: the
      // author still sees their words in the preview and can fix the link.
      spans.push(href ? { text: label, href } : { text: label });
    } else if (token.startsWith("**")) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else {
      spans.push({ text: token.slice(1, -1), italic: true });
    }

    rest = rest.slice(match.index + token.length);
  }

  return spans.filter((s) => s.text.length > 0);
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ").trim()) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    if (/^::chart\b/i.test(trimmed)) {
      flushParagraph();
      const chart = parseChartDirective(trimmed);
      if (chart) blocks.push({ kind: "chart", chart });
      // A malformed directive stays visible as text so the editor sees it.
      else blocks.push({ kind: "paragraph", spans: parseInline(trimmed) });
      continue;
    }


    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        spans: parseInline(heading[2]!.trim()),
      });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
        quoted.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "quote", spans: parseInline(quoted.join(" ").trim()) });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const candidate = (lines[i] ?? "").trim();
        const asBullet = /^[-*+]\s+(.*)$/.exec(candidate);
        const asNumber = /^\d+[.)]\s+(.*)$/.exec(candidate);
        const item = ordered ? asNumber : asBullet;
        if (!item) break;
        items.push(parseInline(item[1]!.trim()));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

/** First sentence-ish of prose, for the inbox preview line. */
export function previewText(source: string, limit = 140): string {
  const first = parseMarkdown(source).find((b) => b.kind === "paragraph");
  if (!first || first.kind !== "paragraph") return "This week in AI spend";
  const text = first.spans.map((s) => s.text).join("");
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
