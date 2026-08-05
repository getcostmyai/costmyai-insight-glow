/**
 * Envelope skeletons (Dispatch 106).
 *
 * The prerequisite for retroactive reprocessing is that something about an
 * unreadable response survives the moment it was unreadable. Retaining the
 * response body would do it — and is forbidden, permanently: this container is
 * a metadata relay and DECISIONS.md §2 says the completion is bytes we are
 * deliberately incapable of holding.
 *
 * A skeleton is the compliant version of the same idea. It keeps the SHAPE of
 * the envelope and its NUMBERS, and destroys everything that could carry
 * content: every string value becomes null, without exception and without
 * inspection. `{"choices":[{"message":{"content":"the customer's answer"}}],
 * "usage":{"prompt_tokens":120}}` becomes
 * `{"choices":[{"message":{"content":null}}],"usage":{"prompt_tokens":120}}`.
 *
 * That is exactly, and only, what a token parser reads. A skeleton is enough
 * to re-run `readUsage` months later against a parser that did not exist when
 * the event was metered, and not enough to reconstruct a single word of a
 * prompt or a completion.
 *
 * Captured only when the read was NOT clean (`tokens_only` or `unparsed`), so
 * the steady state — every provider we already parse — stores nothing at all.
 */

/** Hard bounds. A pathological envelope costs a truncated skeleton, never a row. */
export const SKELETON_LIMITS = {
  maxDepth: 8,
  maxNodes: 400,
  maxArrayItems: 8,
  maxKeyLength: 64,
  maxSerializedBytes: 8 * 1024,
} as const;

/** Marker left in place of anything the bounds cut off, so truncation is visible. */
export const TRUNCATED = "__truncated__";

/**
 * A content-free structural skeleton of a response envelope, or null when
 * there is nothing structural to keep.
 */
export function envelopeSkeleton(value: unknown): unknown {
  let nodes = 0;

  const walk = (node: unknown, depth: number): unknown => {
    if (nodes >= SKELETON_LIMITS.maxNodes || depth > SKELETON_LIMITS.maxDepth) return TRUNCATED;
    nodes++;

    // The only value types that survive: numbers (the whole point), booleans
    // and null. Strings — every one of them, including model names, ids and
    // error messages — are erased here and cannot be recovered downstream.
    if (typeof node === "number") return Number.isFinite(node) ? node : null;
    if (typeof node === "boolean") return node;
    if (node === null || node === undefined) return null;
    if (typeof node === "string") return null;

    if (Array.isArray(node)) {
      const kept = node.slice(0, SKELETON_LIMITS.maxArrayItems).map((item) => walk(item, depth + 1));
      if (node.length > SKELETON_LIMITS.maxArrayItems) kept.push(TRUNCATED);
      return kept;
    }

    if (typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (nodes >= SKELETON_LIMITS.maxNodes) {
          out[TRUNCATED] = true;
          break;
        }
        out[key.slice(0, SKELETON_LIMITS.maxKeyLength)] = walk(child, depth + 1);
      }
      return out;
    }

    return null;
  };

  if (value === null || typeof value !== "object") return null;
  const skeleton = walk(value, 0);
  if (skeleton === TRUNCATED) return null;

  // Second bound, on the serialized form: a wide-but-shallow envelope can pass
  // the node count and still be large. Over the cap, keep nothing rather than
  // store a fragment that would reparse to a wrong number.
  const encoded = JSON.stringify(skeleton);
  if (!encoded || encoded.length > SKELETON_LIMITS.maxSerializedBytes) return null;
  return skeleton;
}

/**
 * The invariant, checkable by anyone: a skeleton contains no string values
 * anywhere except the truncation marker. Enforced again at the ingest edge, so
 * a modified or third-party container cannot post content into this field.
 */
export function isContentFree(value: unknown, depth = 0): boolean {
  if (depth > SKELETON_LIMITS.maxDepth + 2) return false;
  if (value === null) return true;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value === "string") return value === TRUNCATED;
  if (Array.isArray(value)) return value.every((item) => isContentFree(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((v) => isContentFree(v, depth + 1));
  }
  return false;
}
