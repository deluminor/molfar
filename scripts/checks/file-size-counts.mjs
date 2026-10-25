export const DEFAULT_LINE_LIMIT = 250;
export const MAX_EXCEPTION_LIMIT = 500;

export const SIZE_ROOTS = ["src", "host", "scripts", "src-tauri/src"];

const SOURCE_EXTENSION = /\.(ts|tsx|mts|mjs|rs|css)$/;
const EXEMPT = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /(^|\/)tests\.rs$/,
  /(^|\/)tests\//,
];

export function isSizeChecked(file) {
  return (
    SOURCE_EXTENSION.test(file) && !EXEMPT.some((pattern) => pattern.test(file))
  );
}

export function countLines(text) {
  if (text.length === 0) return 0;
  const newlines = text.split("\n").length - 1;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

export function validateExceptions(exceptions) {
  return Object.entries(exceptions).flatMap(([file, { limit, reason }]) => {
    const problems = [];
    if (
      !Number.isInteger(limit) ||
      limit <= DEFAULT_LINE_LIMIT ||
      limit > MAX_EXCEPTION_LIMIT
    ) {
      problems.push(
        `${file}: exception limit must be an integer in (${DEFAULT_LINE_LIMIT}, ${MAX_EXCEPTION_LIMIT}]`,
      );
    }
    if (!reason) problems.push(`${file}: exception needs a reason`);
    return problems;
  });
}

/** Line counts of files over their limit, in baseline shape: `{ file: { lines: n } }`. */
export function oversizedFiles(files, readText, exceptions) {
  const counts = {};

  for (const file of files.filter(isSizeChecked)) {
    const lines = countLines(readText(file));
    const limit = exceptions[file]?.limit ?? DEFAULT_LINE_LIMIT;
    if (lines > limit) counts[file] = { lines };
  }

  return counts;
}
