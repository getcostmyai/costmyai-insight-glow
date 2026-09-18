import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronUp, Loader2, MessageSquare, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { useIsPlatformAdmin } from "@/hooks/use-platform-admin";
import {
  categoriesForBoard,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackBoard,
  type FeedbackCategory,
  type FeedbackPostSummary,
  type FeedbackStatus,
} from "@/lib/feedback";
import {
  addFeedbackComment,
  createFeedbackPost,
  deleteFeedbackComment,
  getFeedbackPost,
  listFeedbackPosts,
  setFeedbackStatus,
  toggleFeedbackVote,
} from "@/lib/feedback.functions";

/**
 * One board implementation, rendered on two boards.
 *
 * The customer board and the partner board differ in exactly three ways: the
 * category set, the links between list and detail, and who can read them. The
 * last of those is a database rule, not a component decision, so nothing here
 * filters anything: a caller who may not see the partner board gets an empty
 * list from RLS whatever this component asks for.
 */

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

const listKey = (board: FeedbackBoard) => ["feedback-posts", board] as const;
const postKey = (board: FeedbackBoard, id: string) => ["feedback-post", board, id] as const;

function DetailLink({
  board,
  id,
  className,
  children,
}: {
  board: FeedbackBoard;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return board === "partner" ? (
    <Link to="/partner/feedback/$id" params={{ id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/feedback/$id" params={{ id }} className={className}>
      {children}
    </Link>
  );
}

export function FeedbackBoardView({ board }: { board: FeedbackBoard }) {
  const queryClient = useQueryClient();
  const posts = useQuery({
    queryKey: listKey(board),
    queryFn: () => listFeedbackPosts({ data: { board } }),
  });
  const categories = categoriesForBoard(board);
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [formOpen, setFormOpen] = useState(false);

  const vote = useMutation({
    mutationFn: (id: string) => toggleFeedbackVote({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(board) }),
  });

  const sorted = useMemo(() => {
    const list = (posts.data ?? []).filter((p) => category === "all" || p.category === category);
    return [...list].sort((a, b) => b.voteCount - a.voteCount);
  }, [posts.data, category]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...categories] as const).map((c) => (
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
          {board === "partner" ? "Suggest something" : "Suggest a feature"}
        </button>
      </div>

      {formOpen ? <NewPostForm board={board} onDone={() => setFormOpen(false)} /> : null}

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
              board={board}
              post={post}
              onVote={() => vote.mutate(post.id)}
              voting={vote.isPending && vote.variables === post.id}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function PostRow({
  board,
  post,
  onVote,
  voting,
}: {
  board: FeedbackBoard;
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
          <DetailLink
            board={board}
            id={post.id}
            className="truncate text-sm font-semibold hover:text-primary"
          >
            {post.title}
          </DetailLink>
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

function NewPostForm({ board, onDone }: { board: FeedbackBoard; onDone: () => void }) {
  const queryClient = useQueryClient();
  const categories = categoriesForBoard(board);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>(categories[0]!);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFeedbackPost({ data: { board, title, body, category } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(board) });
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
        placeholder={
          board === "partner"
            ? "What happened with a client, and what would have made it easier?"
            : "Why does it matter for your spend? A concrete example helps us prioritise."
        }
        maxLength={2000}
        rows={3}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
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

export function FeedbackDetailView({ board, id }: { board: FeedbackBoard; id: string }) {
  const queryClient = useQueryClient();
  const isAdmin = useIsPlatformAdmin();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const post = useQuery({
    queryKey: postKey(board, id),
    queryFn: () => getFeedbackPost({ data: { id } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: postKey(board, id) });
    queryClient.invalidateQueries({ queryKey: listKey(board) });
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
    <>
      {board === "partner" ? (
        <Link
          to="/partner/feedback"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to the board
        </Link>
      ) : (
        <Link
          to="/feedback"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to the board
        </Link>
      )}

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
              {p.comments.length === 0
                ? "No comments yet"
                : `${p.comments.length} comment${p.comments.length === 1 ? "" : "s"}`}
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
                placeholder={
                  isAdmin ? "Reply as the CostMyAI team…" : "Add your experience or a use case…"
                }
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
    </>
  );
}
