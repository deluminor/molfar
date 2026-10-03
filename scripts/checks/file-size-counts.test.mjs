import { describe, expect, it } from "vitest";
import {
  countLines,
  isSizeChecked,
  oversizedFiles,
  validateExceptions,
} from "./file-size-counts.mjs";

const lines = (count) => "x\n".repeat(count);

describe("isSizeChecked", () => {
  it.each([
    ["src/app/App.tsx", true],
    ["src/features/a/model/thing.ts", true],
    ["src-tauri/src/fs.rs", true],
    ["src/styles/index.css", true],
    ["scripts/upstream/patch-sync.mjs", true],
    ["src/app/App.test.ts", false],
    ["scripts/upstream/patch-sync.test.mjs", false],
    ["src/vite-env.d.ts", false],
    ["src-tauri/src/confluence/tests.rs", false],
    ["src-tauri/src/vault/tests/fixtures.rs", false],
    ["src/assets/logo.svg", false],
  ])("%s → %s", (file, checked) => {
    expect(isSizeChecked(file)).toBe(checked);
  });
});

describe("countLines", () => {
  it("counts like wc -l, plus a final line without newline", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
  });
});

describe("oversizedFiles", () => {
  const texts = {
    "src/ok.ts": lines(250),
    "src/big.ts": lines(251),
    "src/excepted.ts": lines(400),
    "src/over-exception.ts": lines(401),
    "src/big.test.ts": lines(900),
  };
  const exceptions = {
    "src/excepted.ts": { limit: 400, reason: "cohesive state machine" },
    "src/over-exception.ts": { limit: 400, reason: "same" },
  };

  it("reports files over the default limit or their exception limit", () => {
    expect(
      oversizedFiles(Object.keys(texts), (file) => texts[file], exceptions),
    ).toEqual({
      "src/big.ts": { lines: 251 },
      "src/over-exception.ts": { lines: 401 },
    });
  });
});

describe("validateExceptions", () => {
  it("requires a reason and a limit above the default and at most 500", () => {
    expect(
      validateExceptions({
        "a.ts": { limit: 300, reason: "ok" },
        "b.ts": { limit: 250, reason: "too low" },
        "c.ts": { limit: 501, reason: "too high" },
        "d.ts": { limit: 300 },
      }),
    ).toEqual([
      "b.ts: exception limit must be an integer in (250, 500]",
      "c.ts: exception limit must be an integer in (250, 500]",
      "d.ts: exception needs a reason",
    ]);
  });
});
