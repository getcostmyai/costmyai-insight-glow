/**
 * The build fingerprint.
 *
 * A deterministic hash of everything that can change what the app serves:
 * every file under `src/`, plus `package.json` and `vite.config.ts`. It is
 * computed the same way in two places — at build time (baked into the bundle
 * by `vite.config.ts`) and on demand by the stale-deploy detector — so a
 * mismatch means exactly one thing: the deployment is not built from this tree.
 *
 * Deliberately not "the git sha": a deploy can be behind the working tree
 * without any commit being involved, and that is the case that has bitten this
 * project repeatedly. The commit is carried alongside as a readable label only.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".output", ".nitro", ".vinxi"]);
/** Generated from the route files themselves — hashing it would double-count. */
const SKIP_FILES = new Set(["src/routeTree.gen.ts"]);

function walk(dir, root, out) {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, root, out);
    else out.push(full);
  }
  return out;
}

/** The hash itself: path + content of every tracked file, in a stable order. */
export function computeFingerprint(root = process.cwd()) {
  const files = [];
  walk(join(root, "src"), root, files);
  for (const extra of ["package.json", "vite.config.ts"]) {
    try {
      statSync(join(root, extra));
      files.push(join(root, extra));
    } catch {
      /* absent in some build contexts; its absence is itself part of the hash */
    }
  }

  const hash = createHash("sha256");
  let counted = 0;
  for (const file of files.sort()) {
    const rel = relative(root, file).split(sep).join("/");
    if (SKIP_FILES.has(rel)) continue;
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
    counted += 1;
  }
  return { fingerprint: hash.digest("hex").slice(0, 16), files: counted };
}

/** Readable label only — never the comparison key. */
export function gitHead(root = process.cwd()) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%H%n%cI%n%s"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const [commit, committedAt, subject] = out.trim().split("\n");
    return { commit, short: commit?.slice(0, 7) ?? null, committedAt, subject };
  } catch {
    return { commit: null, short: null, committedAt: null, subject: null };
  }
}
