/**
 * The committed manifest must be the current source, not a snapshot of it.
 *
 * The daily in-app check reads a manifest emitted at commit time, because the
 * Worker has no source tree to scan. That is only sound if the manifest cannot
 * silently fall behind the code — which is precisely the failure Dispatch 110
 * found in the manual version of this check. So the manifest is regenerated
 * here from the real tree and compared.
 */
import { describe, expect, it } from "vitest";

import { scanRepository } from "../../../../scripts/audit/scan-repository";
import manifest from "../schema-filter-manifest.json";
import { MANIFEST_VERSION, type SchemaFilterManifest } from "../schema-filters";

const committed = manifest as SchemaFilterManifest;

describe("schema-filter manifest", () => {
  it("is the version this build understands", () => {
    expect(committed.version).toBe(MANIFEST_VERSION);
  });

  it("matches a fresh scan of the tree", () => {
    // Tables come from the manifest itself: the scan is table-scoped and this
    // test has no database. A table gaining a watched column is the database
    // half of the check, and the daily job reads that live.
    const watched = new Set(committed.queries.map((q) => q.table));
    const fresh = scanRepository(watched);
    expect(fresh).toEqual(committed.queries);
  });
});
