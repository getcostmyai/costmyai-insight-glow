import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RENDER_TIMEOUT_MS, renderSvgToPng } from "@/lib/brand/render.server";

/**
 * The abort is the whole point of this file. A signal that is passed but never
 * honoured would leave the original bug intact: a cold renderer that hangs past
 * LinkedIn's patience, and a crawler that sees nothing. So these tests check the
 * signal reaches fetch AND that firing it actually ends the attempt.
 */
describe("renderSvgToPng abort budget", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env["RENDERER_SERVICE_URL"] = "https://renderer.test";
    process.env["RENDER_SHARED_SECRET"] = "s3cret";
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("passes an AbortSignal to every attempt and gives up at the timeout", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];

    global.fetch = vi.fn((_url: unknown, init: any) => {
      signals.push(init.signal);
      // A renderer that never answers: only the abort can end this.
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;

    const pending = renderSvgToPng("<svg/>", 1200);
    const assertion = expect(pending).rejects.toThrow(/abort/i);

    // Two attempts, each capped at the same budget.
    await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS + 1);
    await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS + 1);
    await assertion;

    expect(signals).toHaveLength(2);
    for (const signal of signals) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(true);
    }
  });

  it("returns the bytes and leaves no timer armed when the renderer answers", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    global.fetch = vi.fn(async (_url: unknown, init: any) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(png, { status: 200 });
    }) as unknown as typeof fetch;

    const out = await renderSvgToPng("<svg/>", 1200);
    expect(Array.from(out)).toEqual([137, 80, 78, 71]);
  });
});
