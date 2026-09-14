// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FrictionTierBadge } from "@/components/dashboard/FrictionTierBadge";

const friction = {
  tier: "moderate" as const,
  label: "Some setup",
  summary: "Different provider, same request shape.",
  revalidationRecommended: false,
  parity: [{ label: "Request shape", status: "ok" as const, detail: "identical" }],
};

describe("friction tooltip stacking", () => {
  it("renders the panel into document.body, above every card surface", () => {
    render(
      <div style={{ transform: "translateZ(0)", overflow: "auto" }} className="card-surface">
        <FrictionTierBadge friction={friction} />
      </div>,
    );

    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByLabelText(/Some setup/).parentElement!);

    const panel = screen.getByRole("tooltip");
    // Portaled: a transformed, scrollable ancestor cannot clip or overlap it.
    expect(panel.parentElement).toBe(document.body);
    expect(panel.className).toContain("fixed");
    expect(panel.className).toContain("z-[9999]");
  });
});
