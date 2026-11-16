import { git, lines } from "./git.mjs";

export function changedPaths(cwd, from, to) {
  return lines(
    git(cwd, ["diff", "--name-status", "--find-renames", from, to]),
  ).map((line) => {
    const [status, source, destination] = line.split("\t");
    return { status: status[0], source, destination: destination ?? source };
  });
}

export function filePatch(cwd, from, to, change) {
  const paths =
    change.source === change.destination
      ? [change.source]
      : [change.source, change.destination];
  return git(cwd, [
    "diff",
    "--binary",
    "--find-renames",
    from,
    to,
    "--",
    ...paths,
  ]);
}

/** Points a single-file patch at `to`; only header lines are rewritten, never hunk content. */
export function retargetPatch(patch, from, to) {
  let inHeader = false;

  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ")) inHeader = true;
      else if (line.startsWith("@@") || line.startsWith("GIT binary patch"))
        inHeader = false;
      if (!inHeader) return line;

      return line
        .replaceAll(`a/${from}`, `a/${to}`)
        .replaceAll(`b/${from}`, `b/${to}`);
    })
    .join("\n");
}
