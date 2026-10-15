export type ArtifactKind =
  | "task"
  | "spec"
  | "plan"
  | "questions"
  | "answers"
  | "impl_report"
  | "review"
  | "rework_brief"
  | "delivery"
  | "pr_description";

export type ArtifactSource = "stage" | "user" | "engine";

/** Mirrors `task_board::types::ArtifactMeta` in Rust. */
export type ArtifactMeta = {
  id: string;
  cardId: string;
  kind: ArtifactKind;
  version: number;
  source: ArtifactSource;
  stageRunId: string | null;
  createdAt: number;
};

export type ArtifactDoc = { kind: ArtifactKind; version: number; body: string };

export type FindingSeverity = "blocking" | "major" | "minor" | "nit";

export type ReviewFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  file?: string;
  body: string;
};

export type ReviewVerdict = "APPROVE" | "CHANGES_REQUESTED";

export type Review = { verdict: ReviewVerdict; findings: ReviewFinding[] };

export type GrillQuestion = {
  number: number;
  title: string;
  body: string;
  recommended: string;
};

export type GrillAnswer = { number: number; answer: string };
