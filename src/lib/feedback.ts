/**
 * Shared, client-safe constants for the in-product feedback board.
 * Server logic lives in feedback.functions.ts; this module is importable
 * from anywhere (routes, components, tests).
 */

export const FEEDBACK_CATEGORIES = ["feature", "improvement", "bug", "integration"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feature: "Feature",
  improvement: "Improvement",
  bug: "Bug",
  integration: "Integration",
};

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
