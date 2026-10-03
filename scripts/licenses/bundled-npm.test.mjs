import { describe, expect, it } from "vitest";
import { bundledPackageRoots } from "./bundled-npm.mjs";

describe("bundledPackageRoots", () => {
  it("finds plain and scoped packages and ignores project sources", () => {
    expect(
      bundledPackageRoots([
        "host/cli.ts",
        "node_modules/react/index.js",
        "node_modules/react/cjs/react.production.js",
        "node_modules/@tauri-apps/api/core.js",
      ]),
    ).toEqual(["node_modules/@tauri-apps/api", "node_modules/react"]);
  });

  it("keeps a nested copy of a package apart from the top-level one", () => {
    expect(
      bundledPackageRoots(["node_modules/a/index.js", "node_modules/a/node_modules/b/index.js", "node_modules/b/index.js"]),
    ).toEqual(["node_modules/a", "node_modules/a/node_modules/b", "node_modules/b"]);
  });

  it("accepts Windows separators", () => {
    expect(bundledPackageRoots(["node_modules\\@scope\\pkg\\lib\\x.js"])).toEqual(["node_modules/@scope/pkg"]);
  });
});
