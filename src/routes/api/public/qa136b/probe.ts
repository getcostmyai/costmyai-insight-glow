import { createFileRoute } from "@tanstack/react-router";
import { getRequestUrl } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/public/qa136b/probe")({
  server: {
    handlers: {
      GET: async () => {
        const steps: string[] = [];
        try {
          const origin = getRequestUrl().origin;
          steps.push(`origin=${origin}`);
          const m = await import("@/lib/partner-badge.server");
          const badge = await m.readPartnerBadge("D136PROOFBK");
          steps.push(`badge=${badge ? badge.name : "null"}`);
          const png = await m.renderBannerPng(
            badge!,
            "personal",
            origin,
            m.badgeVerifyUrl(origin, "D136PROOFBK"),
          );
          steps.push(`png=${png.length}`);
          let binary = "";
          for (let i = 0; i < png.length; i += 0x8000) {
            binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
          }
          steps.push(`b64=${btoa(binary).length}`);
        } catch (e) {
          steps.push(`ERROR=${e instanceof Error ? e.stack : String(e)}`);
        }
        return new Response(steps.join("\n"), { headers: { "content-type": "text/plain" } });
      },
    },
  },
});
