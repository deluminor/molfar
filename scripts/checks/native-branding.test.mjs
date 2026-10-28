import { describe, expect, it } from "vitest";
import { createTestRepo } from "../upstream/test-repo.mjs";
import { brandingViolations, checkNativeBranding } from "./native-branding.mjs";

describe("native branding guard", () => {
  it("reports runtime identifiers, endpoints and text with line numbers", () => {
    expect(brandingViolations("crates/molfar-core/src/main.rs", 'MOLFAR\nMONOCODE_TOKEN\nhttps://usemono.dev\n"Monocode Native"')).toEqual([
      "crates/molfar-core/src/main.rs:2", "crates/molfar-core/src/main.rs:3", "crates/molfar-core/src/main.rs:4",
    ]);
  });
  it("preserves license files, legal lines, vendor code and upstream issue links", () => {
    for (const file of ["NOTICE", "x/native-editor.LICENSE.txt", "x/LICENSE-MIT", "vendor/gpui-pre/src/lib.rs"]) {
      expect(brandingViolations(file, "MonoCode")).toEqual([]);
    }
    expect(brandingViolations("x.rs", 'Copyright MonoCode\nMOLFAR is derived from MonoCode\nhttps://github.com/hardbeat920/monocode/pull/1142\ngithub.com/hardbeat920/monocode/commit/abc')).toEqual([]);
  });
  it("still rejects brand regressions on a line containing an allowed link", () => {
    expect(brandingViolations("x.rs", 'monocode_core https://github.com/hardbeat920/monocode/issues/1')).toEqual(["x.rs:1"]);
  });
});

it("scans tracked native surfaces and reports original package script line numbers", () => {
  const repo = createTestRepo();
  try {
    repo.setUp({
      "package.json": '{\n  "name": "monocode-unrelated",\n  "scripts": {\n    "native:dev": "MONOCODE_NATIVE_TRACE=1 run",\n    "test": "monocode-unrelated"\n  }\n}\n',
      "crates/molfar-core/src/lib.rs": 'const NAME: &str = "MonoCode";\n',
      "docs/native/NOTICE": "MonoCode attribution\n",
      "src/unrelated.ts": "monocode-unrelated\n",
    });
    expect(checkNativeBranding(repo.root).sort()).toEqual([
      "crates/molfar-core/src/lib.rs:1", "package.json:4",
    ]);
  } finally {
    repo.dispose();
  }
});
