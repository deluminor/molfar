const NODE_MODULES = "node_modules/";

/**
 * Package directories (relative to the bundle's working directory) of every
 * npm package an esbuild metafile pulled into a bundle. The innermost
 * `node_modules` segment wins, so nested copies of a package stay separate.
 */
export function bundledPackageRoots(inputPaths) {
  const roots = new Set();

  for (const input of inputPaths) {
    const path = input.replaceAll("\\", "/");
    const start = path.lastIndexOf(NODE_MODULES);
    if (start === -1) continue;

    const segments = path.slice(start + NODE_MODULES.length).split("/");
    const nameLength = segments[0].startsWith("@") ? 2 : 1;
    if (segments.length <= nameLength) continue;

    roots.add(path.slice(0, start + NODE_MODULES.length) + segments.slice(0, nameLength).join("/"));
  }

  return [...roots].sort();
}
