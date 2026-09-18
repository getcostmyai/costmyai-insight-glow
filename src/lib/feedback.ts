/**
 * Shared, client-safe constants for the in-product feedback boards.
 * Server logic lives in feedback.functions.ts; this module is importable
 * from anywhere (routes, components, tests).
 *
 * There are two boards, separated at the database boundary rather than by a
 * filtered query: the customer board every signed-in person can read, and the
 * partner board only an active partner (or a platform admin) can read. Each
 * board accepts only its own category keys, enforced by a CHECK constraint on
 * feedback_posts, so the lists below have to stay in step with that constraint.
 * Keys are snake_case in the column; the human labels live here.
 */

export const FEEDBACK_BOARDS = ["customer", "partner"] as const;
export type FeedbackBoard = (typeof FEEDBACK_BOARDS)[number];

export const FEEDBACK_CATEGORIES = ["feature", "improvement", "bug", "integration"] as const;
export type CustomerFeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const PARTNER_FEEDBACK_CATEGORIES = [
  "sales_materials",
  "commission",
  "referral_flow",
  "product",
  "bug",
  "data_insights",
  "other",
] as const;
export type PartnerFeedbackCategory = (typeof PARTNER_FEEDBACK_CATEGORIES)[number];

export type FeedbackCategory = CustomerFeedbackCategory | PartnerFeedbackCategory;

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feature: "Feature",
  improvement: "Improvement",
  bug: "Bug",
  integration: "Integration",
  sales_materials: "Sales materials",
  commission: "Commission",
  referral_flow: "Referral flow",
  product: "Product",
  data_insights: "Data and insights",
  other: "Other",
};

export function categoriesForBoard(board: FeedbackBoard): readonly FeedbackCategory[] {
  return board === "partner" ? PARTNER_FEEDBACK_CATEGORIES : FEEDBACK_CATEGORIES;
}

export const FEEDBACK_STATUSES = ["open", "planned", "building", "shipped", "declined"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "Open",
  planned: "Planned",
  building: "Building",
  shipped: "Shipped",
  declined: "Declined",
};

export interface FeedbackPostSummary {
  id: string;
  board: FeedbackBoard;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  authorName: string;
  mine: boolean;
  voteCount: number;
  commentCount: number;
  votedByMe: boolean;
  createdAt: string;
}

export interface FeedbackCommentItem {
  id: string;
  body: string;
  authorName: string;
  isAdminReply: boolean;
  mine: boolean;
  createdAt: string;
}

export interface FeedbackPostDetail extends FeedbackPostSummary {
  comments: FeedbackCommentItem[];
}
