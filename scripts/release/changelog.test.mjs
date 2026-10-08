import { describe, expect, it } from "vitest";
import {
  compareVersions,
  prepareChangelog,
  releaseNotes,
  resolveNextVersion,
  unreleasedNotes,
} from "./changelog.mjs";

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Changed

- Renamed the app.

## [0.6.0] - 2026-09-30

### Added

- Thing.

[Unreleased]: https://github.com/hardbeat920/monocode/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/hardbeat920/monocode/compare/v0.5.0...v0.6.0
`;

const OPTIONS = {
  version: "1.0.0",
  date: "2026-10-02",
  previousTag: "",
  repository: "deluminor/molfar",
};

describe("resolveNextVersion", () => {
  it.each([
    ["patch", "1.2.4"],
    ["minor", "1.3.0"],
    ["major", "2.0.0"],
    ["1.5.0", "1.5.0"],
    ["v1.5.0", "1.5.0"],
  ])("resolves %s from 1.2.3", (request, expected) => {
    expect(resolveNextVersion("1.2.3", request)).toBe(expected);
  });

  it("rejects versions that do not move forward", () => {
    expect(() => resolveNextVersion("1.2.3", "1.2.3")).toThrow("newer");
    expect(() => resolveNextVersion("1.2.3", "1.0.0")).toThrow("newer");
  });

  it("rejects malformed versions", () => {
    expect(() => resolveNextVersion("1.2.3", "1.3")).toThrow("Not a release version");
    expect(() => resolveNextVersion("1.2.3", "1.3.0-beta.1")).toThrow("Not a release version");
  });

  it("orders versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("prepareChangelog", () => {
  it("promotes the Unreleased notes and links the fork release", () => {
    const result = prepareChangelog(CHANGELOG, OPTIONS);

    expect(result?.source).toBe("unreleased");
    expect(releaseNotes(result.changelog, "1.0.0")).toBe("### Changed\n\n- Renamed the app.");
    expect(unreleasedNotes(result.changelog)).toBe("");
    expect(result.changelog).toContain("## [Unreleased]\n\n## [1.0.0] - 2026-10-02\n");
    expect(result.changelog).toContain(
      "[Unreleased]: https://github.com/deluminor/molfar/compare/v1.0.0...HEAD\n[1.0.0]: https://github.com/deluminor/molfar/releases/tag/v1.0.0\n[0.6.0]:",
    );
    expect(releaseNotes(result.changelog, "0.6.0")).toBe("### Added\n\n- Thing.");
  });

  it("compares against the previous fork tag", () => {
    const result = prepareChangelog(CHANGELOG, { ...OPTIONS, previousTag: "v0.9.0" });

    expect(result?.changelog).toContain(
      "[1.0.0]: https://github.com/deluminor/molfar/compare/v0.9.0...v1.0.0",
    );
  });

  it("keeps Unreleased prose and custom sections", () => {
    const custom = CHANGELOG.replace(
      "### Changed\n\n- Renamed the app.\n\n",
      "Upstream sync.\n\n### Security\n\n- Patched a parser.\n  Details on two lines.\n\n### Fixed\n\n- Old bug.\n\n",
    );

    const result = prepareChangelog(custom, OPTIONS);

    expect(releaseNotes(result.changelog, "1.0.0")).toBe(
      "Upstream sync.\n\n### Security\n\n- Patched a parser.\n  Details on two lines.\n\n### Fixed\n\n- Old bug.",
    );
  });

  it("keeps a hand-written section for the version untouched", () => {
    const written = CHANGELOG.replace(
      "## [0.6.0]",
      "## [1.0.0] - 2026-10-01\n\n### Added\n\n- Hand-written.\n\n## [0.6.0]",
    );

    const result = prepareChangelog(written, OPTIONS);

    expect(result).toEqual({ changelog: written, source: "existing" });
  });

  it("refuses an empty Unreleased section", () => {
    const empty = CHANGELOG.replace("### Changed\n\n- Renamed the app.\n\n", "");

    expect(prepareChangelog(empty, OPTIONS)).toBeNull();
  });
});

describe("releaseNotes", () => {
  it("returns null for an unknown version", () => {
    expect(releaseNotes(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("stops at the link references after the last section", () => {
    expect(releaseNotes(CHANGELOG, "0.6.0")).toBe("### Added\n\n- Thing.");
  });
});
