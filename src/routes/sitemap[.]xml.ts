import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { POSTS } from "@/lib/blog/posts";

// TODO: replace with your project URL once a project name or custom domain is set.
const BASE_URL = "";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/models", changefreq: "daily", priority: "0.9" },
          { path: "/pricing", changefreq: "weekly", priority: "0.9" },
          { path: "/intelligence", changefreq: "weekly", priority: "0.8" },
          { path: "/partners", changefreq: "monthly", priority: "0.7" },
          { path: "/blog", changefreq: "weekly", priority: "0.8" },
          ...POSTS.map((p) => ({
            path: `/blog/${p.slug}`,
            changefreq: "monthly" as const,
            priority: "0.7",
          })),


          
          { path: "/legal/methodology", changefreq: "monthly", priority: "0.6" },
          { path: "/legal/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/legal/terms", changefreq: "yearly", priority: "0.3" },

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
