import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { POSTS } from "@/lib/blog/posts";
import { notesNewestFirst } from "@/lib/intelligence/notes";

// The origin the sitemap is served from. Derived from the request, so it is
// correct on preview, on production and behind a custom domain without a
// constant to keep in sync — same source of truth as the share URLs.
function baseUrlFrom(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) {
      return `${request.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}`;
    }
  }
  return url.origin;
}

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const BASE_URL = baseUrlFrom(request);
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/models", changefreq: "daily", priority: "0.9" },
          { path: "/pricing", changefreq: "weekly", priority: "0.9" },
          { path: "/intelligence", changefreq: "weekly", priority: "0.8" },
          // The notes index is only advertised once a note exists; an empty
          // section in the sitemap is a crawl budget spent on nothing.
          ...(notesNewestFirst().length > 0
            ? [
                {
                  path: "/intelligence/notes",
                  changefreq: "weekly" as const,
                  priority: "0.7",
                },
              ]
            : []),
          ...notesNewestFirst().map((n) => ({
            path: `/intelligence/notes/${n.slug}`,
            changefreq: "monthly" as const,
            priority: "0.7",
          })),
          { path: "/standard", changefreq: "monthly", priority: "0.9" },
          { path: "/api", changefreq: "monthly", priority: "0.6" },
          { path: "/partners", changefreq: "monthly", priority: "0.7" },
          { path: "/blog", changefreq: "weekly", priority: "0.8" },
          ...POSTS.map((p) => ({
            path: `/blog/${p.slug}`,
            changefreq: "monthly" as const,
            priority: "0.7",
          })),


          
          { path: "/faq", changefreq: "monthly", priority: "0.8" },
          { path: "/about", changefreq: "monthly", priority: "0.7" },
          { path: "/contact", changefreq: "yearly", priority: "0.5" },
          { path: "/press", changefreq: "monthly", priority: "0.5" },
          { path: "/legal/methodology", changefreq: "monthly", priority: "0.6" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/disclaimer", changefreq: "yearly", priority: "0.3" },
        ];




        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
