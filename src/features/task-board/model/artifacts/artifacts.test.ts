import { describe, expect, it } from "vitest";
import { extractArtifacts } from "./markers";
import { formatAnswers, parseQuestions } from "./questions";
import { defaultSelected, formatReworkBrief, parseReview } from "./review";
import { specPrTitle } from "./spec-frontmatter";
import { readStageOutput } from "./stage-outputs";

const wrap = (kind: string, body: string) => `<<<MOLFAR:${kind}>>>\n${body}\n<<<END:${kind}>>>`;

describe("extractArtifacts", () => {
  it("takes the last complete block and normalizes CRLF", () => {
    const text = `Format: ${wrap("spec", "example")}\r\n\r\n${wrap("spec", "real\r\nspec")}`;
    expect(extractArtifacts(text, ["spec"]).found.spec).toBe("real\nspec");
  });

  it("reports missing, unclosed and empty blocks", () => {
    const text = `<<<MOLFAR:plan>>>\nno end\n${wrap("review", "  ")}`;
    expect(extractArtifacts(text, ["spec", "plan", "review"]).missing).toEqual(["spec", "plan", "review"]);
  });
});

describe("questions", () => {
  const markdown = [
    "## Q1 — Storage",
    "Where do artifacts live?",
    "**Recommended:** App data.",
    "",
    "## Q2: Retries",
    "Retry automatically?",
    "**Recommended** No.",
  ].join("\n");

  it("parses headings, bodies and recommended answers", () => {
    expect(parseQuestions(markdown)).toEqual([
      { number: 1, title: "Storage", body: "Where do artifacts live?", recommended: "App data." },
      { number: 2, title: "Retries", body: "Retry automatically?", recommended: "No." },
    ]);
  });

  it("formats answers, falling back to the recommendation, with an optional note", () => {
    const answers = formatAnswers(parseQuestions(markdown), [{ number: 1, answer: "Repo" }], "Keep it small");
    expect(answers).toContain("**Answer:** Repo");
    expect(answers).toContain("**Answer:** No.");
    expect(answers).toContain("## Note\n\nKeep it small");
  });

  it("allows a note without questions", () => {
    expect(formatAnswers([], [], "Split stage 3")).toBe("## Note\n\nSplit stage 3");
  });
});

describe("review", () => {
  const markdown = [
    "Verdict: CHANGES_REQUESTED",
    "",
    "## F1 [blocking] Race in claim",
    "File: src/claim.rs:12",
    "Two ticks can start one stage.",
    "## F2 [nit] Naming",
    "Rename x.",
  ].join("\n");

  it("parses the verdict and findings", () => {
    const parsed = parseReview(markdown);
    expect(parsed.ok && parsed.review.verdict).toBe("CHANGES_REQUESTED");
    expect(parsed.ok && parsed.review.findings[0]).toEqual({
      id: "F1",
      severity: "blocking",
      title: "Race in claim",
      file: "src/claim.rs:12",
      body: "Two ticks can start one stage.",
    });
  });

  it("refuses a review without a verdict line", () => {
    expect(parseReview("## F1 [nit] x").ok).toBe(false);
  });

  it("preselects blocking and major findings and formats the brief", () => {
    const parsed = parseReview(markdown);
    if (!parsed.ok) throw new Error(parsed.error);
    const findings = parsed.review.findings;

    expect(defaultSelected(findings)).toEqual(["F1"]);
    const brief = formatReworkBrief(findings, ["F1"], "Also add a test");
    expect(brief).toContain("## F1 [blocking] Race in claim\nFile: src/claim.rs:12");
    expect(brief).not.toContain("F2");
    expect(brief).toContain("## Note\n\nAlso add a test");
  });
});

describe("specPrTitle", () => {
  it("reads pr_title from frontmatter only", () => {
    expect(specPrTitle('---\npr_title: "feat(board): add task board"\n---\n# Spec')).toBe("feat(board): add task board");
    expect(specPrTitle("# Spec\npr_title: nope")).toBeUndefined();
  });
});

describe("readStageOutput", () => {
  it("requires spec and plan from grill and accepts optional questions", () => {
    const text = [wrap("spec", "S"), wrap("plan", "P"), wrap("questions", "## Q1 — A\nB\n**Recommended:** C")].join("\n");
    const output = readStageOutput("grill", text);
    expect(output.ok && output.artifacts.map((artifact) => artifact.kind)).toEqual(["spec", "plan", "questions"]);
  });

  it("refuses missing required artifacts and malformed formats", () => {
    expect(readStageOutput("grill", wrap("spec", "S"))).toEqual({ ok: false, error: "The stage did not return: plan." });
    expect(readStageOutput("code_review", wrap("review", "looks fine")).ok).toBe(false);
    expect(readStageOutput("grill", [wrap("spec", "S"), wrap("plan", "P"), wrap("questions", "free text")].join("")).ok).toBe(false);
  });
});
