import { createServer } from "node:http";

import { Resvg } from "@resvg/resvg-js";

/**
 * Minimal off-worker rasteriser.
 *
 * The app builds the SVG (see src/lib/brand/render.server.ts); this service only
 * turns it into pixels, with the exact same resvg settings the wasm renderer
 * used — fit-to-width, Inter as the default family, no system fonts — so the
 * output is byte-comparable to what the worker was producing before.
 */

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RENDER_SHARED_SECRET || "";
const DEFAULT_WIDTH = 1200;

/**
 * Inter carries every brand surface; JetBrains Mono carries identifiers and
 * verification URLs. Fetched as real TTF bytes — the Google CSS endpoint returns
 * TTF URLs when the request carries no modern browser UA, and resvg cannot read
 * woff2. Cached for the life of the process.
 */
// Touched 2026-08-31 to force a cold instance for the OG cold-start verification.
let fontCache = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500",
  ).then((r) => r.text());
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]).slice(0, 6);
  if (urls.length === 0) throw new Error("no TTF face returned for Inter");
  fontCache = await Promise.all(
    urls.map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer())),
  );
  return fontCache;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    const url = new URL(req.url || "/", "http://localhost");
    if (req.method !== "POST" || url.pathname !== "/render") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }

    // A missing secret on the server side must not mean "anyone may render".
    const provided = req.headers["x-render-secret"];
    if (!SECRET || provided !== SECRET) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return;
    }

    const raw = await readBody(req);
    let svg = raw;
    let width = Number(url.searchParams.get("width")) || DEFAULT_WIDTH;
    if ((req.headers["content-type"] || "").includes("application/json")) {
      const parsed = JSON.parse(raw);
      svg = parsed.svg;
      if (parsed.width) width = Number(parsed.width);
    }
    if (typeof svg !== "string" || !svg.includes("<svg")) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("expected an SVG document");
      return;
    }

    const fontBuffers = await loadFonts();
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: { fontBuffers, defaultFontFamily: "Inter", loadSystemFonts: false },
    });
    const png = resvg.render().asPng();

    res.writeHead(200, { "content-type": "image/png", "content-length": png.length });
    res.end(png);
  } catch (err) {
    console.error("render failed:", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("render failed");
  }
});

server.listen(PORT, () => console.log(`renderer listening on :${PORT}`));
