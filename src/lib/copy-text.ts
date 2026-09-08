/**
 * One clipboard path for the whole product.
 *
 * Call sites used to do `void navigator.clipboard?.writeText(x).then(...)`,
 * which has three failure modes that all look identical to a user: no
 * clipboard object at all (older or non-secure contexts), a rejected write
 * (permission denied, document not focused), and an unhandled rejection that
 * silently kills the "Copied" feedback. This helper collapses all three into a
 * boolean the caller can render.
 *
 * The textarea fallback has to run inside the same user gesture as the click,
 * so it is executed synchronously in the catch path rather than deferred.
 */
export async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === "function") {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    document.body.removeChild(el);
    return Boolean(ok);
  } catch {
    return false;
  }
}
