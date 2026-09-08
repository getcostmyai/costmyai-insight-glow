// @vitest-environment jsdom
/**
 * The three failure modes that used to look identical to a user: no clipboard
 * object, a rejected write, and an unhandled rejection swallowing the feedback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/lib/copy-text";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setClipboard(undefined);
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("returns true when the clipboard API accepts the write", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back and reports false when the write rejects and execCommand fails", async () => {
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error("denied"))) });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("uses the textarea fallback when the clipboard API is missing", async () => {
    setClipboard(undefined);
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: () => boolean }).execCommand = exec;
    await expect(copyText("hello")).resolves.toBe(true);
    expect(exec).toHaveBeenCalled();
  });

  it("never throws when everything is unavailable", async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand?: unknown }).execCommand = undefined;
    await expect(copyText("hello")).resolves.toBe(false);
  });
});
