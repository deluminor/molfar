import { describe, expect, it } from "vitest";
import { resolveStageSkills, skillCandidates } from "./resolve-stage-skills";

describe("skillCandidates", () => {
  it("pairs a hub skill with its unprefixed alias", () => {
    expect(skillCandidates("d-code-review")).toEqual(["d-code-review", "code-review"]);
  });

  it("leaves non-hub names alone", () => {
    expect(skillCandidates("code-review")).toEqual(["code-review"]);
  });
});

describe("resolveStageSkills", () => {
  it("auto-detects hub skills when present", () => {
    const available = new Set(["d-code-review", "d-security-review", "d-merge-request-writer"]);
    expect(resolveStageSkills("code_review", undefined, available)).toEqual({
      skills: ["d-code-review", "d-security-review", "d-merge-request-writer"],
      missing: [],
    });
  });

  it("falls back to the unprefixed alias when the hub skill is absent", () => {
    const available = new Set(["code-review", "d-security-review"]);
    expect(resolveStageSkills("code_review", undefined, available)).toEqual({
      skills: ["code-review", "d-security-review"],
      missing: [],
    });
  });

  it("omits a slot when neither candidate exists", () => {
    const available = new Set(["d-merge-request-writer"]);
    expect(resolveStageSkills("code_review", undefined, available)).toEqual({
      skills: ["d-merge-request-writer"],
      missing: [],
    });
  });

  it("returns no skills when the catalog is empty", () => {
    expect(resolveStageSkills("code_review", undefined, new Set())).toEqual({
      skills: [],
      missing: [],
    });
  });

  it("uses an explicit list and reports missing names", () => {
    const available = new Set(["d-code-review"]);
    expect(resolveStageSkills("code_review", ["d-code-review", "custom-review"], available)).toEqual({
      skills: ["d-code-review"],
      missing: ["custom-review"],
    });
  });

  it("treats an empty explicit list as no skills", () => {
    expect(resolveStageSkills("code_review", [], new Set(["d-code-review"]))).toEqual({
      skills: [],
      missing: [],
    });
  });

  it("dedupes an explicit list", () => {
    const available = new Set(["a", "b"]);
    expect(resolveStageSkills("grill", ["a", "a", "b"], available)).toEqual({
      skills: ["a", "b"],
      missing: [],
    });
  });
});
