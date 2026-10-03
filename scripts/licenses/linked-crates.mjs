function isProcMacro(pkg) {
  return pkg.targets.some((target) => target.kind.includes("proc-macro"));
}

function linksNormally(dep) {
  return dep.dep_kinds.some((kind) => kind.kind === null);
}

/**
 * Packages from `cargo metadata` that end up in the shipped binary: reachable
 * from the workspace members through normal dependencies. Build and dev
 * dependencies, and proc-macros with everything only they pull in, run at
 * compile time and are not distributed.
 */
export function linkedPackages(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const members = new Set(metadata.workspace_members);

  const seen = new Set();
  const queue = [...members];
  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);

    for (const dep of nodes.get(id)?.deps ?? []) {
      if (!linksNormally(dep) || isProcMacro(packages.get(dep.pkg))) continue;
      queue.push(dep.pkg);
    }
  }

  return [...seen]
    .filter((id) => !members.has(id))
    .map((id) => packages.get(id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}
