import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChevronUp, Loader2, ShieldCheck, Trash2 } from "lucide-react";

import { AccountShell } from "@/components/dashboard/AccountShell";
import { useIsPlatformAdmin } from "@/hooks/use-platform-admin";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
} from "@/lib/feedback";
import {
  addFeedbackComment,
  deleteFeedbackComment,
  getFeedbackPost,
  setFeedbackStatus,
  toggleFeedbackVote,
} from "@/lib/feedback.functions";
import { StatusChip } from "./feedback.index";

export const Route = createFileRoute("/_authenticated/feedback/$id")({
  head: () => ({
    meta: [
      { title: "Suggestion — CostMyAI feedback board" },
      {
        name: "description",
        content: "Votes, status and team replies for one suggestion on the CostMyAI feedback board.",
      },
      { property: "og:title", content: "Suggestion — CostMyAI feedback board" },
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
  const queryClient = useQueryClient();
  const isAdmin = useIsPlatformAdmin();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const post = useQuery({
    queryKey: ["feedback-post", id],
    queryFn: () => getFeedbackPost({ data: { id } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["feedback-post", id] });
    queryClient.invalidateQueries({ queryKey: ["feedback-posts"] });
  };

  const vote = useMutation({
    mutationFn: () => toggleFeedbackVote({ data: { id } }),
    onSuccess: refresh,
  });

  const addComment = useMutation({
    mutationFn: () => addFeedbackComment({ data: { postId: id, body: comment } }),
    onSuccess: () => {
      setComment("");
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not post the comment."),
  });

  const removeComment = useMutation({
    mutationFn: (commentId: string) => deleteFeedbackComment({ data: { id: commentId } }),
    onSuccess: refresh,
  });

  const changeStatus = useMutation({
    mutationFn: (status: FeedbackStatus) => setFeedbackStatus({ data: { postId: id, status } }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof Error ? err.message : "Could not change the status."),
  });

  const p = post.data;

  return (
    <AccountShell active="feedback" title="Suggestion" intro={null}>
      <Link
        to="/feedback"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the board
      </Link>

      {post.isPending ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !p ? (
        <p className="py-10 text-sm text-muted-foreground">That suggestion does not exist.</p>
      ) : (
        <>
          <div className="flex items-stretch gap-3 rounded-2xl border border-border bg-card p-4">
            <button
              type="button"
              onClick={() => vote.mutate()}
              disabled={vote.isPending}
              aria-label={p.votedByMe ? "Remove your vote" : "Upvote this suggestion"}
              className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition ${
                p.votedByMe
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <ChevronUp className="h-5 w-5" />
              <span className="text-sm font-semibold tabular-nums">{p.voteCount}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold">{p.title}</h1>
                <StatusChip status={p.status} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {FEEDBACK_CATEGORY_LABELS[p.category]}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {p.authorName} · {new Date(p.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {isAdmin === true ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <span className="text-xs font-medium text-primary">Team status</span>
              {FEEDBACK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={changeStatus.isPending || p.status === s}
                  onClick={() => changeStatus.mutate(s)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    p.status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  } disabled:opacity-60`}
                >
                  {FEEDBACK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          ) : null}

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">
              {p.comments.length === 0 ? "No comments yet" : `${p.comments.length} comment${p.comments.length === 1 ? "" : "s"}`}
            </h2>
            <ul className="space-y-2.5">
              {p.comments.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-2xl border p-3.5 ${
                    c.isAdminReply ? "border-primary/25 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {c.isAdminReply ? (
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        <ShieldCheck className="h-3 w-3" /> CostMyAI team
                      </span>
                    ) : (
                      <span>{c.authorName}</span>
                    )}
                    <span>· {new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.mine ? (
                      <button
                        type="button"
                        onClick={() => removeComment.mutate(c.id)}
                        aria-label="Delete your comment"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>

            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                addComment.mutate();
              }}
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={isAdmin ? "Reply as the CostMyAI team…" : "Add your experience or a use case…"}
                rows={3}
                maxLength={1000}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={addComment.isPending || comment.trim().length === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Post comment
              </button>
            </form>
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </section>
        </>
      )}
    </AccountShell>
  );
}
