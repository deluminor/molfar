import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareToBaseline,
  runRatchet,
  sortCounts,
  transferBlockers,
} from "./baseline.mjs";

describe("compareToBaseline", () => {
  it("flags new files, new kinds and grown counts as regressions", () => {
    const baseline = { "a.ts": { rule: 2 } };
    const current = { "a.ts": { rule: 3, other: 1 }, "b.ts": { rule: 1 } };

    expect(compareToBaseline(current, baseline).regressions).toEqual([
      { file: "a.ts", kind: "rule", count: 3, allowed: 2 },
      { file: "a.ts", kind: "other", count: 1, allowed: 0 },
      { file: "b.ts", kind: "rule", count: 1, allowed: 0 },
    ]);
  });

  it("flags shrunk and vanished counts as improvements", () => {
    const baseline = { "a.ts": { rule: 2 }, "b.ts": { rule: 1 } };
    const current = { "a.ts": { rule: 1 } };

    expect(compareToBaseline(current, baseline)).toEqual({
      regressions: [],
      improvements: [
        { file: "a.ts", kind: "rule", count: 1, allowed: 2 },
        { file: "b.ts", kind: "rule", count: 0, allowed: 1 },
      ],
    });
  });
});

describe("transferBlockers", () => {
  const baseline = { "big.ts": { rule: 3 }, "other.ts": { rule: 1 } };

  it("accepts findings that moved between files without growing in total", () => {
    const current = {
      "big.ts": { rule: 1 },
      "new.ts": { rule: 2 },
      "other.ts": { rule: 1 },
    };
    const { regressions } = compareToBaseline(current, baseline);

    expect(
      transferBlockers(current, baseline, regressions, { allowNewFiles: true }),
    ).toEqual([]);
  });

  it("blocks when a kind's total grows", () => {
    const current = {
      "big.ts": { rule: 3 },
      "new.ts": { rule: 1 },
      "other.ts": { rule: 1 },
    };
    const { regressions } = compareToBaseline(current, baseline);

    expect(
      transferBlockers(current, baseline, regressions, { allowNewFiles: true }),
    ).toEqual(["rule total grew 4 -> 5"]);
  });

  it("blocks findings in files new to the baseline when new files are not allowed", () => {
    const current = {
      "big.ts": { rule: 1 },
      "new.ts": { rule: 2 },
      "other.ts": { rule: 1 },
    };
    const { regressions } = compareToBaseline(current, baseline);

    expect(
      transferBlockers(current, baseline, regressions, {
        allowNewFiles: false,
      }),
    ).toEqual(["new.ts is new to the baseline"]);
  });
});

describe("sortCounts", () => {
  it("sorts files and kinds and drops empty files", () => {
    expect(
      JSON.stringify(
        sortCounts({ "b.ts": { z: 1, a: 2 }, "a.ts": {}, "c.ts": { x: 1 } }),
      ),
    ).toBe(JSON.stringify({ "b.ts": { a: 2, z: 1 }, "c.ts": { x: 1 } }));
  });
});

describe("runRatchet", () => {
  let dir;
  let baselinePath;
  const run = (current, update = false) =>
    runRatchet({
      name: "test",
      baselinePath,
      current,
      update,
      updateCommand: "update",
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "molfar-ratchet-"));
    baselinePath = join(dir, "baseline.json");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("requires a baseline unless updating, then creates it", () => {
    expect(run({ "a.ts": { rule: 1 } })).toBe(1);
    expect(run({ "a.ts": { rule: 1 } }, true)).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({
      "a.ts": { rule: 1 },
    });
  });

  it("passes on an unchanged tree and fails on a regression", () => {
    writeFileSync(baselinePath, JSON.stringify({ "a.ts": { rule: 1 } }));

    expect(run({ "a.ts": { rule: 1 } })).toBe(0);
    expect(run({ "a.ts": { rule: 2 } })).toBe(1);
  });

  it("refuses to loosen the baseline on update", () => {
    writeFileSync(baselinePath, JSON.stringify({ "a.ts": { rule: 1 } }));

    expect(run({ "a.ts": { rule: 2 } }, true)).toBe(1);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual({
      "a.ts": { rule: 1 },
    });
  });

  it("accepts moved findings only with --transfer", () => {
    writeFileSync(baselinePath, JSON.stringify({ "a.ts": { rule: 2 } }));
    const moved = { "a.ts": { rule: 1 }, "b.ts": { rule: 1 } };

    expect(
      runRatchet({
        name: "test",
        baselinePath,
        current: moved,
        update: true,
        updateCommand: "u",
      }),
    ).toBe(1);
    expect(
      runRatchet({
        name: "test",
        baselinePath,
        current: moved,
        update: true,
        transfer: true,
        updateCommand: "u",
      }),
    ).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual(moved);
  });

  it("fails on an improvement until the baseline is tightened", () => {
    writeFileSync(baselinePath, JSON.stringify({ "a.ts": { rule: 2 } }));

    expect(run({ "a.ts": { rule: 1 } })).toBe(1);
    expect(run({ "a.ts": { rule: 1 } }, true)).toBe(0);
    expect(run({ "a.ts": { rule: 1 } })).toBe(0);
  });
});
