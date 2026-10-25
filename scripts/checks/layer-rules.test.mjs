import { describe, expect, it } from "vitest";
import { importSpecifiers, resolveSpecifier } from "./import-specifiers.mjs";
import { importViolation } from "./layer-rules.mjs";

describe("importViolation", () => {
  it.each([
    ["src/app/App.tsx", "src/features/sessions/model/session", null],
    ["src/main.tsx", "src/app/App", null],
    [
      "src/features/inbox/ui/InboxView",
      "src/integrations/harness/core/types",
      null,
    ],
    ["src/integrations/harness/core/apply", "src/platform/tauri/fs", null],
    ["src/platform/tauri/fs", "src/domain/session/session", null],
    ["src/domain/session/session", "src/shared/lib/paths", null],
    ["src/shared/ui/Modal", "src/styles/modal.css", null],
    ["host/engine", "src/integrations/harness/core/child", null],
    ["host/engine", "src/domain/session/session", null],
    [
      "src/features/settings/ui/SettingsView",
      "src/app/shell/Sidebar",
      "layer:features->app",
    ],
    [
      "src/integrations/harness/core/apply",
      "src/features/sessions/model/session",
      "layer:integrations->features",
    ],
    [
      "src/platform/tauri/fs",
      "src/features/sessions/model/session",
      "layer:platform->features",
    ],
    ["src/shared/ui/Modal", "src/app/shell/GlassBackdrop", "layer:shared->app"],
    [
      "src/domain/session/session",
      "src/platform/tauri/fs",
      "layer:domain->platform",
    ],
    ["host/engine", "src/platform/tauri/fs", "layer:host->platform"],
    [
      "host/engine",
      "src/features/sessions/model/session",
      "layer:host->features",
    ],
    ["src/features/files/ui/FileTree", "host/engine", "layer:features->host"],
  ])("%s → %s: %s", (from, to, violation) => {
    expect(importViolation(from, to)).toBe(violation);
  });

  it("allows other features' root and first-level files, not deeper ones", () => {
    expect(
      importViolation("src/features/a/ui/A", "src/features/notes/notes"),
    ).toBeNull();
    expect(
      importViolation("src/features/a/ui/A", "src/features/b/model/thing"),
    ).toBeNull();
    expect(
      importViolation("src/features/a/ui/A", "src/features/b/model/split/part"),
    ).toBe("feature-internal:b");
    expect(
      importViolation("src/features/b/ui/B", "src/features/b/model/split/part"),
    ).toBeNull();
  });

  it("ignores files outside the layered tree", () => {
    expect(importViolation("scripts/x.mjs", "src/app/App")).toBeNull();
    expect(importViolation("src/app/App.tsx", "vendor/lib")).toBeNull();
  });
});

describe("importSpecifiers", () => {
  it("finds static, side-effect, dynamic, mock and worker URL specifiers", () => {
    const source = `
      import { a } from "./a";
      import type {
        B,
      } from '../b';
      export * from "./c";
      import "./side.css";
      const d = await import("./d");
      vi.mock("./e", () => ({}));
      const f = await vi.importActual<typeof import("./f")>("./f");
      new Worker(new URL("./g.worker.ts", import.meta.url));
      import React from "react";
    `;

    expect(importSpecifiers(source).sort()).toEqual(
      [
        "../b",
        "./a",
        "./c",
        "./d",
        "./e",
        "./f",
        "./g.worker.ts",
        "./side.css",
        "react",
      ].sort(),
    );
  });
});

describe("resolveSpecifier", () => {
  it("resolves relative and alias specifiers and skips packages", () => {
    expect(resolveSpecifier("src/features/a/ui/A.tsx", "../model/b")).toBe(
      "src/features/a/model/b",
    );
    expect(
      resolveSpecifier("src/features/a/ui/A.tsx", "@/shared/lib/paths"),
    ).toBe("src/shared/lib/paths");
    expect(resolveSpecifier("host/engine.ts", "../src/domain/x")).toBe(
      "src/domain/x",
    );
    expect(resolveSpecifier("src/a.ts", "./icon.svg?raw")).toBe("src/icon.svg");
    expect(resolveSpecifier("src/a.ts", "react")).toBeNull();
  });
});
