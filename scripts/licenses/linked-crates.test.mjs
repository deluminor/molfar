import { describe, expect, it } from "vitest";
import { LICENSE_FILE, linkedPackages, renderNotices } from "./linked-crates.mjs";

const lib = (name, kind = "lib") => ({ id: name, name, version: "1.0.0", targets: [{ kind: [kind] }] });
const dep = (pkg, kind = null) => ({ pkg, dep_kinds: [{ kind, target: null }] });

const METADATA = {
  workspace_members: ["app"],
  packages: [
    lib("app", "bin"),
    lib("serde"),
    lib("serde_derive", "proc-macro"),
    lib("syn"),
    lib("cc"),
    lib("pretty_assertions"),
    lib("itoa"),
  ],
  resolve: {
    nodes: [
      { id: "app", deps: [dep("serde"), dep("cc", "build"), dep("pretty_assertions", "dev")] },
      { id: "serde", deps: [dep("serde_derive"), dep("itoa")] },
      { id: "serde_derive", deps: [dep("syn")] },
      { id: "syn", deps: [] },
      { id: "cc", deps: [] },
      { id: "pretty_assertions", deps: [] },
      { id: "itoa", deps: [] },
    ],
  },
};

describe("linkedPackages", () => {
  it("follows normal dependencies only and skips proc-macros with what only they need", () => {
    expect(linkedPackages(METADATA).map((pkg) => pkg.name)).toEqual(["itoa", "serde"]);
  });

  it("keeps a crate a proc-macro also uses when the binary links it directly", () => {
    const metadata = structuredClone(METADATA);
    metadata.resolve.nodes[0].deps.push(dep("syn"));

    expect(linkedPackages(metadata).map((pkg) => pkg.name)).toEqual(["itoa", "serde", "syn"]);
  });
});

describe("renderNotices", () => {
  it("prints a shared license text once for every crate that ships it", () => {
    const notices = renderNotices([
      { name: "a", version: "1.0.0", license: "MIT", texts: ["MIT text\n"] },
      { name: "b", version: "2.0.0", license: "MIT", texts: ["MIT text"] },
      { name: "c", version: "0.1.0", license: "Apache-2.0", texts: ["Apache text"] },
    ]);

    expect(notices).toContain("## a 1.0.0 (MIT), b 2.0.0 (MIT)\n\n````text\nMIT text\n````");
    expect(notices).toContain("## c 0.1.0 (Apache-2.0)\n\n````text\nApache text\n````");
    expect(notices.match(/MIT text/g)).toHaveLength(1);
  });

  it("points to the source of MPL-licensed crates", () => {
    const notices = renderNotices([
      { name: "cssparser", version: "0.29.6", license: "MPL-2.0", texts: ["MPL text"] },
      { name: "serde", version: "1.0.0", license: "MIT OR Apache-2.0", texts: ["MIT text"] },
    ]);

    expect(notices).toContain("- cssparser 0.29.6 (MPL-2.0): https://crates.io/crates/cssparser/0.29.6");
    expect(notices).not.toContain("crates.io/crates/serde");
  });

  it("lists crates without license files with their declared license", () => {
    const notices = renderNotices([{ name: "bare", version: "0.3.0", license: "MIT OR Apache-2.0", texts: [] }]);

    expect(notices).toContain("## Crates without bundled license files");
    expect(notices).toContain("- bare 0.3.0 (MIT OR Apache-2.0)");
  });
});

describe("LICENSE_FILE", () => {
  it("matches common license file names and nothing else", () => {
    const names = ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE", "license.txt", "COPYING", "NOTICE", "UNLICENSE", "COPYRIGHT"];

    expect(names.every((name) => LICENSE_FILE.test(name))).toBe(true);
    expect(["README.md", "Cargo.toml", "licenses"].some((name) => LICENSE_FILE.test(name))).toBe(false);
  });
});
