import { posix } from "node:path";

const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bvi\.(?:mock|doMock|importActual|importMock)\s*(?:<[^>]*>)?\(\s*["']([^"']+)["']/g,
  /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g,
];

export function importSpecifiers(source) {
  const specifiers = new Set();

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }

  return [...specifiers];
}

/** Repo-relative target of a local import (relative or `@/`), without extension; null for packages. */
export function resolveSpecifier(file, specifier) {
  const bare = specifier.split("?")[0];
  if (bare.startsWith("@/")) return posix.normalize(`src/${bare.slice(2)}`);
  if (!bare.startsWith(".")) return null;

  return posix.normalize(posix.join(posix.dirname(file), bare));
}
