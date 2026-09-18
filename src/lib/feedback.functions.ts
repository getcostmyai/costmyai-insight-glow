import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  FEEDBACK_BOARDS,
  FEEDBACK_CATEGORIES,
  PARTNER_FEEDBACK_CATEGORIES,
  type FeedbackBoard,
  type FeedbackCommentItem,
  type FeedbackPostDetail,
  type FeedbackPostSummary,
} from "./feedback";

/**
 * The two feedback boards. Every function here is authenticated and RLS does
 * the heavy lifting: the customer board is readable by any signed-in user, the
 * partner board only by an active partner or a platform admin, writes are
 * scoped to auth.uid(), status changes go through the guarded
 * set_feedback_status() function. Server-side .server helpers are imported
 * inside handlers so nothing server-only reaches the client bundle.
 *
 * The `board` argument below selects which board the caller is looking at. It
 * is never the authority on whether they may see it: the policies on
 * feedback_posts, feedback_comments and feedback_votes are, and a partner board
 * read by a customer comes back empty no matter what the client sends. The
 * schema check here exists so a partner category cannot be filed on the
 * customer board or the reverse, which the CHECK constraint also refuses.
 */

const boardSchema = z.enum(FEEDBACK_BOARDS);

const postSchema = z
  .object({
    board: boardSchema.default("customer"),
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(10).max(2000),
    category: z.string(),
  })
  .refine(
    (v) =>
      (v.board === "partner"
        ? (PARTNER_FEEDBACK_CATEGORIES as readonly string[])
        : (FEEDBACK_CATEGORIES as readonly string[])
      ).includes(v.category),
    { message: "That category does not belong to this board.", path: ["category"] },
  );

const listSchema = z.object({ board: boardSchema.default("customer") });
const idSchema = z.object({ id: z.string().uuid() });
const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});
const statusSchema = z.object({
  postId: z.string().uuid(),
  status: z.enum(["open", "planned", "building", "shipped", "declined"]),
});

type PostRow = {
  id: string;
  board: FeedbackBoard;
  title: string;
  body: string;
  category: FeedbackPostSummary["category"];
  status: FeedbackPostSummary["status"];
  author_id: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
  feedback_votes: { count: number }[];
  feedback_comments: { count: number }[];
};

const POST_SELECT =
  "id, board, title, body, category, status, author_id, created_at, profiles!feedback_posts_author_id_fkey(full_name), feedback_votes(count), feedback_comments(count)";

/** Who the person is, on the board they are standing on, when they have no name set. */
const anonymousAuthor = (board: FeedbackBoard) => (board === "partner" ? "A partner" : "A customer");

function toSummary(row: PostRow, myVotes: Set<string>, userId: string): FeedbackPostSummary {
  const board: FeedbackBoard = row.board === "partner" ? "partner" : "customer";
  return {
    id: row.id,
    board,
    title: row.title,
    body: row.body,
    category: row.category,
    status: row.status,
    authorName: row.profiles?.full_name?.trim() || anonymousAuthor(board),
    mine: row.author_id === userId,
    voteCount: row.feedback_votes[0]?.count ?? 0,
    commentCount: row.feedback_comments[0]?.count ?? 0,
    votedByMe: myVotes.has(row.id),
    createdAt: row.created_at,
  };
}

async function myVoteSet(supabase: any, userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("feedback_votes")
    .select("post_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((v: { post_id: string }) => v.post_id));
}

export const listFeedbackPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<FeedbackPostSummary[]> => {
    const { supabase, userId } = context;
    const [{ data: rows, error }, votes] = await Promise.all([
      supabase
        .from("feedback_posts")
        .select(POST_SELECT)
        .eq("board", data.board)
        .order("created_at", { ascending: false }),
      myVoteSet(supabase, userId),
    ]);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PostRow[]).map((row) => toSummary(row, votes, userId));
  });

export const getFeedbackPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<FeedbackPostDetail> => {
    const { supabase, userId } = context;
    const [{ data: post, error }, votes, { data: comments, error: cErr }] = await Promise.all([
      supabase.from("feedback_posts").select(POST_SELECT).eq("id", data.id).maybeSingle(),
      myVoteSet(supabase, userId),
      supabase
        .from("feedback_comments")
        .select("id, body, author_id, is_admin_reply, created_at, profiles!feedback_comments_author_id_fkey(full_name)")
        .eq("post_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    if (cErr) throw new Error(cErr.message);
    if (!post) throw new Error("Suggestion not found");

    const commentItems: FeedbackCommentItem[] = (
      (comments ?? []) as unknown as {
        id: string;
        body: string;
        author_id: string;
        is_admin_reply: boolean;
        created_at: string;
        profiles: { full_name: string | null } | null;
      }[]
    ).map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.profiles?.full_name?.trim() || "A customer",
      isAdminReply: c.is_admin_reply,
      mine: c.author_id === userId,
      createdAt: c.created_at,
    }));

    return { ...toSummary(post as unknown as PostRow, votes, userId), comments: commentItems };
  });

export const createFeedbackPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => postSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { enforceRateLimit, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.feedbackPost, userId);

    const { data: row, error } = await supabase
      .from("feedback_posts")
      .insert({ title: data.title, body: data.body, category: data.category, author_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const toggleFeedbackVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ voted: boolean; voteCount: number }> => {
    const { supabase, userId } = context;
    const { enforceRateLimit, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.feedbackVote, userId);

    const { data: existing } = await supabase
      .from("feedback_votes")
      .select("post_id")
      .eq("post_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    let voted: boolean;
    if (existing) {
      const { error } = await supabase
        .from("feedback_votes")
        .delete()
        .eq("post_id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      voted = false;
    } else {
      const { error } = await supabase
        .from("feedback_votes")
        .insert({ post_id: data.id, user_id: userId });
      if (error) throw new Error(error.message);
      voted = true;
    }

    const { count } = await supabase
      .from("feedback_votes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", data.id);
    return { voted, voteCount: count ?? 0 };
  });

/** Email the post author about a team action. Fire-and-forget. */
async function notifyAuthor(opts: { postId: string; statusLabel?: string; detail?: string }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: post } = await supabaseAdmin
      .from("feedback_posts")
      .select("title, profiles!feedback_posts_author_id_fkey(email)")
      .eq("id", opts.postId)
      .maybeSingle();
    const email = (post as any)?.profiles?.email as string | undefined;
    if (!email) return;
    const { feedbackPostUrl } = await import("./email-links");
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    await sendTemplateEmail("feedback-status", email, {
      templateData: {
        postTitle: (post as any).title,
        statusLabel: opts.statusLabel ?? "New reply",
        detail: opts.detail ?? "The CostMyAI team replied to your suggestion.",
        postUrl: feedbackPostUrl(opts.postId),
      },
      idempotencyKey: `feedback-${opts.postId}-${opts.statusLabel ?? "reply"}-${Date.now()}`,
    });
  } catch (err) {
    console.error("feedback notification failed", err instanceof Error ? err.message : String(err));
  }
}

export const addFeedbackComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => commentSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { enforceRateLimit, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.feedbackComment, userId);

    const { data: row, error } = await supabase
      .from("feedback_comments")
      .insert({ post_id: data.postId, body: data.body, author_id: userId })
      .select("id, is_admin_reply")
      .single();
    if (error) throw new Error(error.message);

    // An official reply emails the author (unless the author is the admin).
    if ((row as any).is_admin_reply) {
      const { data: post } = await supabase
        .from("feedback_posts")
        .select("author_id")
        .eq("id", data.postId)
        .maybeSingle();
      if (post && (post as any).author_id !== userId) {
        void notifyAuthor({ postId: data.postId, detail: data.body.slice(0, 280) });
      }
    }
    return { id: row.id };
  });

export const deleteFeedbackComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("feedback_comments")
      .delete()
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => statusSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("is_platform_admin");
    if (roleErr || isAdmin !== true) throw new Error("Forbidden: platform admins only");

    const { error } = await supabase.rpc("set_feedback_status", {
      _post_id: data.postId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);

    const labels: Record<string, string> = {
      open: "Open",
      planned: "Planned",
      building: "Building",
      shipped: "Shipped",
      declined: "Declined",
    };
    void notifyAuthor({ postId: data.postId, statusLabel: labels[data.status] });
    return { ok: true };
  });
