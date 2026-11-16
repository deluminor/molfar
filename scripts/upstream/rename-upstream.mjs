import { posix } from "node:path";

const TOKEN = /[A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*/g;
const RELATIVE_SPECIFIER = /(["'])(\.{1,2}\/[^"'\n]*)\1/g;
const MODULE_EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", ".css", "/index.ts", "/index.tsx"];
const PLACEHOLDER = /\u0000(\d+)\u0000/g;

const capitalize = (word) => word[0].toUpperCase() + word.slice(1);

function variants({ from, to }) {
  const mixed = from === "monocode" ? [[/MonoCode/g, "Molfar"], [/monoCode/g, "molfar"]] : [];

  return [
    ...mixed,
    [new RegExp(`(?<![a-z])${from}(?=s(?![a-z])|(?![a-z]))`, "g"), to],
    [new RegExp(`(?<![A-Z])${capitalize(from)}(?=s(?![a-z])|(?![a-z]))`, "g"), capitalize(to)],
    [new RegExp(`(?<![A-Z])${from.toUpperCase()}(?=S(?![A-Z])|(?![A-Z]))`, "g"), to.toUpperCase()],
  ];
}

/** Candidate MOLFAR spelling of one identifier-like token, or the token itself. */
export function renameToken(token, renames, keepPhrases = []) {
  const saved = [];
  const renamed = renames
    .flatMap(variants)
    .reduce((out, [pattern, to]) => out.replace(pattern, to), protect(token, keepPhrases, saved));

  return renamed.replace(PLACEHOLDER, (_, index) => saved[Number(index)]);
}

/** Counts tokens that mention any rename source or target word. */
export function countTokens(text, renames, counts = new Map()) {
  const words = new RegExp(renames.flatMap(({ from, to }) => [from, to]).join("|"), "i");

  for (const [token] of text.matchAll(TOKEN)) {
    if (words.test(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

/**
 * Picks the spelling MOLFAR uses: the target file's own usage wins, then the
 * whole tree's; tokens MOLFAR has never seen take the renamed spelling.
 */
function choose(token, renamed, fileCounts, treeCounts) {
  for (const counts of [fileCounts, treeCounts]) {
    const kept = counts?.get(token) ?? 0;
    const moved = counts?.get(renamed) ?? 0;
    if (moved > 0 && kept === 0) return renamed;
    if (kept > 0 && moved === 0) return token;
    if (counts === treeCounts && (kept > 0 || moved > 0)) return moved >= kept ? renamed : token;
  }

  return renamed;
}

function protect(text, patterns, saved) {
  return patterns.reduce(
    (out, pattern) => out.replace(pattern, (match) => `\u0000${saved.push(match) - 1}\u0000`),
    text,
  );
}

/**
 * Translates upstream paths and file contents into MOLFAR's names.
 * `paths` holds every path tracked on MOLFAR's side; `treeCounts` comes from
 * `countTokens` over MOLFAR's tree.
 */
export function createRenamer({ renames, keepPhrases, paths, treeCounts }) {
  const known = new Set(paths);
  for (const path of paths) {
    for (let i = path.indexOf("/"); i !== -1; i = path.indexOf("/", i + 1)) known.add(path.slice(0, i));
  }

  const exists = (path) => MODULE_EXTENSIONS.some((extension) => known.has(path + extension));

  const rename = (token) => renameToken(token, renames, keepPhrases);

  function mapPath(path) {
    if (known.has(path)) return path;

    const out = [];

    for (const segment of path.split("/")) {
      const renamed = segment.replace(TOKEN, rename);
      const raw = [...out, segment].join("/");
      const moved = [...out, renamed].join("/");
      out.push(renamed === segment || exists(moved) || !exists(raw) ? renamed : segment);
    }

    return out.join("/");
  }

  function mapSpecifier(specifier, fromFile, toFile) {
    const resolved = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
    const mapped = mapPath(resolved);
    if (mapped === resolved && fromFile === toFile) return specifier;

    const relative = posix.relative(posix.dirname(toFile), mapped);
    return relative.startsWith(".") ? relative : `./${relative}`;
  }

  /** `fileText` is MOLFAR's current copy of the target file, when it has one. */
  function translate(text, { fromFile, toFile, fileText }) {
    const saved = [];
    const fileCounts = fileText === undefined ? undefined : countTokens(fileText, renames);

    let out = text.replace(RELATIVE_SPECIFIER, (_, quote, specifier) => {
      const mapped = `${quote}${mapSpecifier(specifier, fromFile, toFile)}${quote}`;
      return `\u0000${saved.push(mapped) - 1}\u0000`;
    });
    out = protect(out, keepPhrases, saved);
    out = out.replace(TOKEN, (token) => {
      const renamed = rename(token);
      if (/^(?:MonoCode|Monocode)$/.test(token) && renamed === "Molfar") {
        for (const counts of [fileCounts, treeCounts]) {
          const identifier = counts?.get("Molfar") ?? 0;
          const brand = counts?.get("MOLFAR") ?? 0;
          if (identifier || brand) return brand >= identifier ? "MOLFAR" : "Molfar";
        }
        return "MOLFAR";
      }
      if (/monocode/i.test(token)) return renamed;
      return renamed === token ? token : choose(token, renamed, fileCounts, treeCounts);
    });

    return out.replace(PLACEHOLDER, (_, index) => saved[Number(index)]);
  }

  return { mapPath, translate };
}
