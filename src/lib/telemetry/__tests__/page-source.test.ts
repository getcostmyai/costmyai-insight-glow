import { describe, expect, it } from "vitest";

import { sanitizePagePath, sanitizeRouteId } from "../page-path";
import { parseSource, readFirstTouch, referrerOrigin } from "../source-cookie";

describe("page path sanitizer", () => {
  it("keeps real route paths and drops query and hash", () => {
    expect(sanitizePagePath("/pricing")).toBe("/pricing");
    expect(sanitizePagePath("/blog/why-ai-costs?utm_term=secret")).toBe("/blog/why-ai-costs");
    expect(sanitizePagePath("/about#team")).toBe("/about");
    expect(sanitizePagePath("/about/")).toBe("/about");
  });

  it("refuses anything that is not a path", () => {
    expect(sanitizePagePath("https://evil.test/x")).toBeNull();
    expect(sanitizePagePath("pricing")).toBeNull();
    expect(sanitizePagePath("/a\u0000b")).toBe("/ab");
    expect(sanitizePagePath("/<script>")).toBeNull();
    expect(sanitizePagePath(42)).toBeNull();
  });

  it("caps length", () => {
    expect(sanitizePagePath("/" + "a".repeat(500))!.length).toBe(200);
  });

  it("bounds the route id to the generated shape", () => {
    expect(sanitizeRouteId("/blog/$slug")).toBe("/blog/$slug");
    expect(sanitizeRouteId("/_authenticated/workspace")).toBe("/_authenticated/workspace");
    expect(sanitizeRouteId("nonsense")).toBeNull();
  });
});

describe("first-touch source", () => {
  it("reduces a referrer to its origin, never the path or query", () => {
    expect(referrerOrigin("https://www.google.com/search?q=private+terms")).toBe(
      "https://www.google.com",
    );
    expect(referrerOrigin("javascript:alert(1)")).toBeNull();
    expect(referrerOrigin(null)).toBeNull();
  });

  it("treats same-host navigation as no source", () => {
    expect(referrerOrigin("https://costmyai.com/pricing", "costmyai.com")).toBeNull();
  });

  it("reads only the three UTM fields and clamps them", () => {
    const s = readFirstTouch(
      "https://costmyai.com/?utm_source=hn&utm_medium=social&utm_campaign=launch&utm_term=leak",
      "https://news.ycombinator.com/item?id=1",
    );
    expect(s).toEqual({
      origin: "https://news.ycombinator.com",
      utmSource: "hn",
      utmMedium: "social",
      utmCampaign: "launch",
    });
    expect(JSON.stringify(s)).not.toContain("leak");
  });

  it("drops implausible UTM values rather than echoing them", () => {
    const s = readFirstTouch("https://costmyai.com/?utm_source=<script>&utm_medium=ok", null);
    expect(s.utmSource).toBeNull();
    expect(s.utmMedium).toBe("ok");
  });

  it("re-validates on read", () => {
    expect(parseSource("o=https%3A%2F%2Fx.com&s=hn")).toEqual({
      origin: "https://x.com",
      utmSource: "hn",
      utmMedium: null,
      utmCampaign: null,
    });
    expect(parseSource("o=notaurl")).toBeNull();
    expect(parseSource("")).toBeNull();
  });
});
