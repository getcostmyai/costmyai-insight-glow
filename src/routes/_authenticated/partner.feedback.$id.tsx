import { createFileRoute } from "@tanstack/react-router";

import { FeedbackDetailView } from "@/components/feedback/FeedbackBoardView";

export const Route = createFileRoute("/_authenticated/partner/feedback/$id")({
  head: () => ({
    meta: [
      { title: "Partner suggestion | CostMyAI" },
      {
        name: "description",
        content: "A partner suggestion on the CostMyAI partner board, with comments and status.",
      },
      { property: "og:title", content: "Partner suggestion | CostMyAI" },
      {
        property: "og:description",
        content: "A partner suggestion on the CostMyAI partner board.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PartnerFeedbackDetailPage,
});

function PartnerFeedbackDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="max-w-3xl">
      <FeedbackDetailView board="partner" id={id} />
    </div>
  );
}
