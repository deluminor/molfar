import { describe, expect, it } from "vitest";
import { lintCounts } from "./lint-counts.mjs";

describe("lintCounts", () => {
  it("counts errors and warnings per file and rule, ignoring infos", () => {
    const report = {
      diagnostics: [
        {
          severity: "error",
          category: "lint/a",
          location: { path: "src/a.ts" },
        },
        {
          severity: "error",
          category: "lint/a",
          location: { path: "src/a.ts" },
        },
        {
          severity: "warning",
          category: "lint/b",
          location: { path: "src/a.ts" },
        },
        {
          severity: "info",
          category: "lint/c",
          location: { path: "src/a.ts" },
        },
        {
          severity: "error",
          category: "parse",
          location: { path: "src/b.css" },
        },
        { severity: "fatal", category: "deserialize", location: {} },
      ],
    };

    expect(lintCounts(report)).toEqual({
      "src/a.ts": { "lint/a": 2, "lint/b": 1 },
      "src/b.css": { parse: 1 },
      "(configuration)": { deserialize: 1 },
    });
  });

  it("keys files by forward-slash paths so Windows reports match the baseline", () => {
    const report = {
      diagnostics: [
        {
          severity: "warning",
          category: "lint/a",
          location: { path: "src\\features\\a.ts" },
        },
      ],
    };

    expect(lintCounts(report)).toEqual({
      "src/features/a.ts": { "lint/a": 1 },
    });
  });
});
