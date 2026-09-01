import { describe, expect, it } from "vitest";

import {
  chartAltText,
  chartImageUrl,
  chartPixelHeight,
  parseChartDirective,
  parseMarkdown,
} from "../markdown";
import { chartSvg } from "../chart-svg.server";

describe("chart directives", () => {
  it("parses a full directive", () => {
    const spec = parseChartDirective(
      '::chart kind=bars title="Biggest cuts, last 7 days" data="GPT-5.1:-40|Claude:-12" note="Blended."',
    );
    expect(spec).toEqual({
      kind: "bars",
      title: "Biggest cuts, last 7 days",
      data: "GPT-5.1:-40|Claude:-12",
      note: "Blended.",
    });
  });

  it("keeps a malformed directive visible as text rather than dropping the section", () => {
    const blocks = parseMarkdown("::chart kind=pie data=\"a:1\"");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("paragraph");
  });

  it("rejects a directive with no usable rows", () => {
    expect(parseChartDirective('::chart kind=bars data=""')).toBeNull();
  });

  it("becomes a chart block inside a body", () => {
    const blocks = parseMarkdown(
      'Intro.\n\n::chart kind=spread data="DeepSeek V3.2:0.234:3.375"\n\nOutro.',
    );
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "chart", "paragraph"]);
  });

  it("escapes markup coming from the title into the drawing", () => {
    const svg = chartSvg({ kind: "bars", title: '</text><script>x</script>', data: "A:-5" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("builds an absolute, self-contained image url", () => {
    const url = chartImageUrl(
      { kind: "bars", title: "Cuts", data: "A:-40" },
      "https://costmyai.com/",
    );
    expect(url).toContain("https://costmyai.com/api/public/og/newsletter/chart.png?");
    expect(url).toContain("kind=bars");
    expect(url).toContain("A%3A-40");
  });

  it("describes itself in words for clients that block images", () => {
    expect(chartAltText({ kind: "bars", title: "Cuts", data: "GPT-5.1:-40" })).toBe(
      "Cuts. GPT-5.1 -40",
    );
  });

  it("draws each kind at the height the email reserves", () => {
    for (const spec of [
      { kind: "bars" as const, title: "a", data: "A:-40|B:-12" },
      { kind: "spread" as const, title: "b", data: "M:0.234:3.375" },
      { kind: "scatter" as const, title: "c", data: "Opus:89.1:10|GLM:84.3:0.12" },
    ]) {
      const svg = chartSvg(spec);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(`height="${chartPixelHeight(spec)}"`);
    }
  });
});
