import {
  bundledLanguages,
  bundledLanguagesInfo,
  type BundledLanguage,
} from "shiki";

const aliases: Record<string, string> = Object.fromEntries(
  bundledLanguagesInfo.flatMap((info) => [
    [info.id, info.id],
    ...(info.aliases ?? []).map((alias) => [alias, info.id]),
  ]),
);
/** File names Shiki's aliases don't cover by extension. */
const BY_NAME: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
  gemfile: "ruby",
  rakefile: "ruby",
  "cmakelists.txt": "cmake",
};
const BY_EXTENSION: Record<string, string> = {
  zsh: "shellscript",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  kt: "kotlin",
  mdx: "mdx",
  lock: "json",
};

/** Shiki's language for a file, by its name, or undefined to leave it plain. */
export function languageForFile(path: string): BundledLanguage | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1)
    : "";
  const language =
    BY_NAME[name] ??
    BY_EXTENSION[extension] ??
    (extension ? aliases[extension] : undefined);
  return language && language in bundledLanguages
    ? (language as BundledLanguage)
    : undefined;
}
