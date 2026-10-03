import { createHash } from "node:crypto";

export const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright|unlicense)([-._].*)?$/i;

function repositoryKey(url) {
  return url ? url.trim().toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "") : null;
}

/**
 * Crates split out of one repository often ship the license file in only one
 * of them (alloc-stdlib vs alloc-no-stdlib). Reuse a sibling's files so the
 * copyright notice a BSD or MIT license requires is still reproduced.
 */
export function borrowRepositoryLicenses(crates) {
  const donors = new Map();
  for (const crate of crates) {
    const key = repositoryKey(crate.repository);
    if (key && crate.texts.length > 0 && !donors.has(key)) donors.set(key, crate);
  }

  return crates.map((crate) => {
    const donor = donors.get(repositoryKey(crate.repository));
    if (crate.texts.length > 0 || !donor) return crate;

    return { ...crate, texts: donor.texts, licenseSource: donor.name };
  });
}

/** Markdown listing each crate with its license texts; identical texts are printed once. */
export function renderNotices(
  crates,
  {
    title = "Rust dependency licenses",
    intro = "The MOLFAR desktop binary links the following Rust crates.",
    sourceUrl = (crate) => `https://crates.io/crates/${crate.name}/${crate.version}`,
  } = {},
) {
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

  const label = (crate) => {
    const details = [crate.license, crate.licenseSource && `license file from ${crate.licenseSource}, same repository`]
      .filter(Boolean)
      .join("; ");
    return `${crate.name} ${crate.version}${details ? ` (${details})` : ""}`;
  };
  const sections = [...groups.values()].map(
    (group) => `## ${group.crates.map(label).join(", ")}\n\n\`\`\`\`text\n${group.body}\n\`\`\`\``,
  );
  const sourceRequired = crates.filter((crate) => /\bMPL-/.test(crate.license ?? ""));
  if (sourceRequired.length > 0) {
    sections.push(
      `## Source code for MPL-licensed packages\n\nThese packages are used unmodified; their source code is available at:\n\n${sourceRequired.map((crate) => `- ${label(crate)}: ${sourceUrl(crate)}`).join("\n")}`,
    );
  }
  if (withoutFiles.length > 0) {
    sections.push(
      `## Packages without bundled license files\n\nThese packages declare their license in package metadata only.\n\n${withoutFiles.map((crate) => `- ${label(crate)}`).join("\n")}`,
    );
  }

  return `# ${title}\n\n${intro}\n\n${sections.join("\n\n")}\n`;
}
