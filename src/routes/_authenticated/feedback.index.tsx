import { createFileRoute } from "@tanstack/react-router";

import { AccountShell } from "@/components/dashboard/AccountShell";
import { FeedbackBoardView } from "@/components/feedback/FeedbackBoardView";

export { StatusChip } from "@/components/feedback/FeedbackBoardView";

export const Route = createFileRoute("/_authenticated/feedback/")({
  head: () => ({
    meta: [
      { title: "Feedback board | CostMyAI" },
      {
        name: "description",
        content:
          "Suggest features, vote on what other customers asked for, and see what the CostMyAI team is building next.",
      },
      { property: "og:title", content: "Feedback board | CostMyAI" },
      {
        property: "og:description",
        content: "Suggest features and vote on what CostMyAI builds next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackBoardPage,
});

function FeedbackBoardPage() {
  return (
    <AccountShell
      active="feedback"
      title="Feedback board"
      intro="Tell us what would make CostMyAI more useful. Vote on what other customers asked for, and watch what we are building."
    >
      <FeedbackBoardView board="customer" />
    </AccountShell>
  );
}
