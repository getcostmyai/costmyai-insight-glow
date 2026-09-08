// @vitest-environment jsdom
/**
 * A copy that silently does nothing is worse than one that says it failed.
 * Both the rejection path and the missing-clipboard path must land on a visible
 * terminal state, not stay on the idle icon.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/intelligence-telemetry.functions", () => ({
  trackIntelligenceShare: vi.fn(() => Promise.resolve()),
}));

import { ShareControls } from "@/components/marketing/ShareControls";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  setClipboard(undefined);
  vi.restoreAllMocks();
});

async function clickCopy() {
  render(<ShareControls cardId="kpi-moves" title="42 moves" url="https://www.costmyai.com/x" />);
  fireEvent.click(screen.getByLabelText("Copy link"));
}

describe("ShareControls copy failure", () => {
  it("shows a failed state when the clipboard write rejects", async () => {
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error("denied"))) });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    await clickCopy();
    await waitFor(() => {
      const btn = document.querySelector('[data-share-platform="copy_link"]');
      expect(btn?.getAttribute("data-share-state")).toBe("fail");
      expect(btn?.getAttribute("aria-label")).toBe("Copy failed");
    });
  });

  it("shows a failed state when there is no clipboard at all", async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    await clickCopy();
    await waitFor(() => {
      const btn = document.querySelector('[data-share-platform="copy_link"]');
      expect(btn?.getAttribute("data-share-state")).toBe("fail");
    });
    expect(screen.getByText("Copy failed")).toBeInTheDocument();
  });
});
