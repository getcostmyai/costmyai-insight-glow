import { createFileRoute } from "@tanstack/react-router";

import { FeedbackBoardView } from "@/components/feedback/FeedbackBoardView";

export const Route = createFileRoute("/_authenticated/partner/feedback/")({
  head: () => ({
    meta: [
      { title: "Partner feedback | CostMyAI" },
      {
        name: "description",
        content:
          "A board for CostMyAI partners: ask for sales material, raise commission and referral questions, and vote on what other partners need.",
      },
      { property: "og:title", content: "Partner feedback | CostMyAI" },
      {
        property: "og:description",
        content: "Where CostMyAI partners ask for what they need to sell and serve clients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PartnerFeedbackBoardPage,
});

function PartnerFeedbackBoardPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Partner feedback</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        Only partners and the CostMyAI team can read this board. Ask for the material you need,
        raise anything about commission or the referral flow, and vote on what other partners asked
        for.
      </p>
      <FeedbackBoardView board="partner" />
    </div>
  );
}
