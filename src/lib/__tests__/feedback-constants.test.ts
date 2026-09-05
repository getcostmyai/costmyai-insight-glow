import { describe, expect, it } from "vitest";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "../feedback";

describe("feedback board constants", () => {
  it("has a label for every category", () => {
    for (const c of FEEDBACK_CATEGORIES) {
      expect(FEEDBACK_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it("has a label for every status, in lifecycle order", () => {
    expect(FEEDBACK_STATUSES).toEqual(["open", "planned", "building", "shipped", "declined"]);
    for (const s of FEEDBACK_STATUSES) {
      expect(FEEDBACK_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("category and status values match the database check constraints", () => {
    // Keep in sync with the feedback_posts.category / .status CHECK lists.
    expect(FEEDBACK_CATEGORIES).toEqual(["feature", "improvement", "bug", "integration"]);
  });
});
