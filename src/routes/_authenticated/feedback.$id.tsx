import { createFileRoute } from "@tanstack/react-router";

import { AccountShell } from "@/components/dashboard/AccountShell";
import { FeedbackDetailView } from "@/components/feedback/FeedbackBoardView";

export const Route = createFileRoute("/_authenticated/feedback/$id")({
  head: () => ({
    meta: [
      { title: "Suggestion | CostMyAI feedback board" },
      {
        name: "description",
        content: "Votes, status and team replies for one suggestion on the CostMyAI feedback board.",
      },
      { property: "og:title", content: "Suggestion | CostMyAI feedback board" },
      {
        property: "og:description",
        content: "Votes, status and team replies for one suggestion on the CostMyAI feedback board.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackDetailPage,
});

function FeedbackDetailPage() {
  const { id } = Route.useParams();
  return (
    <AccountShell active="feedback" title="Suggestion">
      <FeedbackDetailView board="customer" id={id} />
    </AccountShell>
  );
}
