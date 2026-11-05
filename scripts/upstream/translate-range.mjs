import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, lines } from "./git.mjs";
import { resolvePath } from "./move-map.mjs";
import { KEEP_PHRASES, RENAMES, VERBATIM_PATHS } from "./rename-map.mjs";
import { countTokens, createRenamer } from "./rename-upstream.mjs";

const EMPTY_BLOB = /^0+$/;

function createTreeRenamer(cwd) {
  const words = RENAMES.flatMap(({ from, to }) => [from, to]).join("|");
  let matches = "";
  try {
    matches = git(cwd, ["grep", "-I", "-h", "-o", "-i", "-E", `[A-Za-z0-9_$-]*(${words})[A-Za-z0-9_$-]*`, "HEAD"]);
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  return createRenamer({
    renames: RENAMES,
    keepPhrases: KEEP_PHRASES,
    paths: lines(git(cwd, ["ls-tree", "-r", "--name-only", "HEAD"])),
    treeCounts: countTokens(matches, RENAMES),
  });
}

function headText(cwd, path) {
  try {
    return git(cwd, ["show", `HEAD:${path}`]);
  } catch {
    return undefined;
  }
}

/** MOLFAR's current text for a renamed upstream path, following the move map when the file moved. */
function molfarText(cwd, map, path) {
  const resolved = resolvePath(cwd, map, path);
  return headText(cwd, resolved.path ?? path);
}

/**
 * Rewrites upstream's `from..to` change set into MOLFAR's names (rename-map.mjs): both sides of every
 * changed file are translated, stored as blobs and written as two trees. Diffing those trees yields
 * per-path patches that still carry real preimage blobs for a three-way apply.
 */
export function translateRange(cwd, map, from, to) {
  const renamer = createTreeRenamer(cwd);
  const scratch = mkdtempSync(join(tmpdir(), "molfar-upstream-"));
  const sides = { before: [], after: [] };
  const remapped = [];

  try {
    const raw = git(cwd, ["diff", "--raw", "--no-abbrev", "--no-renames", "-z", from, to]).split("\0").filter(Boolean);

    for (let i = 0; i < raw.length; i += 2) {
      const [modeBefore, modeAfter, blobBefore, blobAfter] = raw[i].slice(1).split(" ");
      const path = raw[i + 1];
      const verbatim = VERBATIM_PATHS.some((pattern) => pattern.test(path));
      const guarded = map.splits[path] || map.removed[path];
      const renamed = guarded ? path : renamer.mapPath(path);
      const target = renamed === path ? path : (map.renames[path] ?? renamed);
      const context = { fromFile: path, toFile: target, fileText: molfarText(cwd, map, target) };
      if (target !== path) remapped.push(`${path} -> ${target}`);

      const store = (blob) => {
        if (verbatim) return blob;
        const content = git(cwd, ["cat-file", "-p", blob], undefined, { encoding: "buffer" });
        if (content.includes(0)) return blob;
        const translated = renamer.translate(content.toString("utf8"), context);
        return git(cwd, ["hash-object", "-w", "--stdin"], translated).trim();
      };

      if (!EMPTY_BLOB.test(blobBefore)) sides.before.push(`${modeBefore} ${store(blobBefore)}\t${target}`);
      if (!EMPTY_BLOB.test(blobAfter)) sides.after.push(`${modeAfter} ${store(blobAfter)}\t${target}`);
    }

    const [before, after] = ["before", "after"].map((side) => {
      const env = { GIT_INDEX_FILE: join(scratch, side) };
      git(cwd, ["update-index", "--add", "--index-info"], sides[side].map((entry) => `${entry}\n`).join(""), { env });
      return git(cwd, ["write-tree"], undefined, { env }).trim();
    });

    return { before, after, remapped };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
