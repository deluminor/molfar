import { describe, expect, it } from "vitest";
import { linkedPackages } from "./linked-crates.mjs";

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
