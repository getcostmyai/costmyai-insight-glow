import { createFileRoute } from "@tanstack/react-router";

import {
  badgeVerifyUrl,
  readPartnerBadge,
  renderBannerPng,
  type BannerFormat,
} from "@/lib/partner-badge.server";

// TEMPORARY visual-QA route — deleted in the same dispatch.
export const Route = createFileRoute("/api/public/qa136tmp/$format")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const b = await readPartnerBadge("D136PROOFBK");
        if (!b) return new Response("no", { status: 404 });
        const origin = new URL(request.url).origin;
        const png = await renderBannerPng(
          b,
          params.format as BannerFormat,
          origin,
          badgeVerifyUrl("https://costmyai.com", b.code),
        );
        return new Response(png as unknown as BodyInit, {
          headers: { "content-type": "image/png" },
        });
      },
    },
  },
});
