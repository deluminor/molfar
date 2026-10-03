import { createHash } from "node:crypto";

export const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright|unlicense)([-._].*)?$/i;

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

/** Markdown listing each crate with its license texts; identical texts are printed once. */
export function renderNotices(crates) {
  const groups = new Map();
  const withoutFiles = [];

  for (const crate of crates) {
    if (crate.texts.length === 0) {
      withoutFiles.push(crate);
      continue;
    }

    const body = crate.texts.map((text) => text.trim()).join("\n\n---\n\n");
    const key = createHash("sha256").update(body).digest("hex");
    const group = groups.get(key) ?? { body, crates: [] };
    group.crates.push(crate);
    groups.set(key, group);
  }

  const label = (crate) => `${crate.name} ${crate.version}${crate.license ? ` (${crate.license})` : ""}`;
  const sections = [...groups.values()].map(
    (group) => `## ${group.crates.map(label).join(", ")}\n\n\`\`\`\`text\n${group.body}\n\`\`\`\``,
  );
  const sourceRequired = crates.filter((crate) => /\bMPL-/.test(crate.license ?? ""));
  if (sourceRequired.length > 0) {
    sections.push(
      `## Source code for MPL-licensed crates\n\nThese crates are used unmodified; their source code is available at:\n\n${sourceRequired.map((crate) => `- ${label(crate)}: https://crates.io/crates/${crate.name}/${crate.version}`).join("\n")}`,
    );
  }
  if (withoutFiles.length > 0) {
    sections.push(
      `## Crates without bundled license files\n\nThese crates declare their license in package metadata only.\n\n${withoutFiles.map((crate) => `- ${label(crate)}`).join("\n")}`,
    );
  }

  return `# Rust dependency licenses\n\nThe Vatra desktop binary links the following Rust crates.\n\n${sections.join("\n\n")}\n`;
}
