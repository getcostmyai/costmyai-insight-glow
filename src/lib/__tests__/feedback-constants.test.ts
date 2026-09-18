import { describe, expect, it } from "vitest";

import {
  categoriesForBoard,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  PARTNER_FEEDBACK_CATEGORIES,
} from "../feedback";

describe("feedback board constants", () => {
  it("has a label for every category on both boards", () => {
    for (const c of [...FEEDBACK_CATEGORIES, ...PARTNER_FEEDBACK_CATEGORIES]) {
      expect(FEEDBACK_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it("keeps the two category sets apart", () => {
    expect(categoriesForBoard("customer")).toEqual(FEEDBACK_CATEGORIES);
    expect(categoriesForBoard("partner")).toEqual(PARTNER_FEEDBACK_CATEGORIES);
    // Only "bug" is deliberately shared.
    const shared = FEEDBACK_CATEGORIES.filter((c) =>
      (PARTNER_FEEDBACK_CATEGORIES as readonly string[]).includes(c),
    );
    expect(shared).toEqual(["bug"]);
  });

  it("matches the partner half of the board aware check constraint", () => {
    expect(PARTNER_FEEDBACK_CATEGORIES).toEqual([
      "sales_materials",
      "commission",
      "referral_flow",
      "product",
      "bug",
      "data_insights",
      "other",
    ]);
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
