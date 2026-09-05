import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronUp, Loader2, MessageSquare, Plus } from "lucide-react";

import { AccountShell } from "@/components/dashboard/AccountShell";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackPostSummary,
  type FeedbackStatus,
} from "@/lib/feedback";
import { createFeedbackPost, listFeedbackPosts, toggleFeedbackVote } from "@/lib/feedback.functions";

export const Route = createFileRoute("/_authenticated/feedback/")({
  head: () => ({
    meta: [
      { title: "Feedback board — CostMyAI" },
      {
        name: "description",
        content:
          "Suggest features, vote on what other customers asked for, and see what the CostMyAI team is building next.",
      },
      { property: "og:title", content: "Feedback board — CostMyAI" },
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

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  open: "bg-muted text-muted-foreground",
  planned: "bg-primary/10 text-primary",
  building: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  shipped: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  declined: "bg-muted text-muted-foreground line-through",
};

export function StatusChip({ status }: { status: FeedbackStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}
    >
      {FEEDBACK_STATUS_LABELS[status]}
    </span>
  );
}

function FeedbackBoardPage() {
  const queryClient = useQueryClient();
  const posts = useQuery({ queryKey: ["feedback-posts"], queryFn: () => listFeedbackPosts() });
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);

  const vote = useMutation({
    mutationFn: (id: string) => toggleFeedbackVote({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback-posts"] }),
  });

  const sorted = useMemo(() => {
    const list = (posts.data ?? []).filter((p) => category === "all" || p.category === category);
    return [...list].sort((a, b) => b.voteCount - a.voteCount);
  }, [posts.data, category]);

  return (
    <AccountShell
      active="feedback"
      title="Feedback board"
      intro="Tell us what would make CostMyAI more useful. Vote on what other customers asked for, and watch what we are building."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...FEEDBACK_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                category === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "all" ? "All" : FEEDBACK_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Suggest a feature
        </button>
      </div>

      {formOpen ? <NewPostForm onDone={() => setFormOpen(false)} /> : null}

      {posts.isPending ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading suggestions…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Be the first to suggest what we should build.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              onVote={() => vote.mutate(post.id)}
              voting={vote.isPending && vote.variables === post.id}
            />
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

function PostRow({
  post,
  onVote,
  voting,
}: {
  post: FeedbackPostSummary;
  onVote: () => void;
  voting: boolean;
}) {
  return (
    <li className="flex items-stretch gap-3 rounded-2xl border border-border bg-card p-3.5">
      <button
        type="button"
        onClick={onVote}
        disabled={voting}
        aria-label={post.votedByMe ? "Remove your vote" : "Upvote this suggestion"}
        className={`flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition ${
          post.votedByMe
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        }`}
      >
        <ChevronUp className="h-4 w-4" />
        <span className="text-xs font-semibold tabular-nums">{post.voteCount}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/feedback/$id"
            params={{ id: post.id }}
            className="truncate text-sm font-semibold hover:text-primary"
          >
            {post.title}
          </Link>
          <StatusChip status={post.status} />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {FEEDBACK_CATEGORY_LABELS[post.category]}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{post.authorName}</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {post.commentCount}
          </span>
        </div>
      </div>
    </li>
  );
}

function NewPostForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFeedbackPost({ data: { title, body, category } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-posts"] });
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not post that."),
  });

  return (
    <form
      className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What should we build? One clear sentence."
        maxLength={120}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Why does it matter for your spend? A concrete example helps us prioritise."
        maxLength={2000}
        rows={3}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        {FEEDBACK_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-xs ${
              category === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {FEEDBACK_CATEGORY_LABELS[c]}
          </button>
        ))}
        <button
          type="submit"
          disabled={create.isPending || title.trim().length < 3 || body.trim().length < 10}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Post suggestion
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
