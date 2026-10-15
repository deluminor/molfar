import type {
  FindingSeverity,
  Review,
  ReviewFinding,
  ReviewVerdict,
} from "../../types/artifact";

const VERDICT = /^Verdict:\s*(APPROVE|CHANGES_REQUESTED)\s*$/i;
const FINDING = /^##\s+(F\d+)\s*\[(blocking|major|minor|nit)\]\s*(.+)$/i;
const FILE = /^File:\s*(.+)$/i;

export type ParsedReview = { ok: true; review: Review } | { ok: false; error: string };

export function parseReview(markdown: string): ParsedReview {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.find((line) => line.trim());
  const verdict = first ? VERDICT.exec(first.trim()) : null;
  if (!verdict)
    return { ok: false, error: "Review must start with `Verdict: APPROVE | CHANGES_REQUESTED`." };

  const findings: ReviewFinding[] = [];
  for (const line of lines) {
    const heading = FINDING.exec(line.trim());
    if (heading) {
      findings.push({
        id: heading[1].toUpperCase(),
        severity: heading[2].toLowerCase() as FindingSeverity,
        title: heading[3].trim(),
        body: "",
      });
      continue;
    }

    const current = findings[findings.length - 1];
    if (!current) continue;
    const file = FILE.exec(line.trim());
    if (file && !current.file && !current.body) current.file = file[1].trim();
    else current.body = `${current.body}\n${line}`;
  }

  for (const finding of findings) finding.body = finding.body.trim();
  return {
    ok: true,
    review: { verdict: verdict[1].toUpperCase() as ReviewVerdict, findings },
  };
}

/** Blocking and major findings are preselected for rework; the rest are opt-in. */
export function defaultSelected(findings: readonly ReviewFinding[]): string[] {
  return findings
    .filter((finding) => finding.severity === "blocking" || finding.severity === "major")
    .map((finding) => finding.id);
}

export function formatReworkBrief(
  findings: readonly ReviewFinding[],
  selected: readonly string[],
  note: string,
): string {
  const chosen = findings.filter((finding) => selected.includes(finding.id));
  const blocks = chosen.map((finding) => {
    const file = finding.file ? `\nFile: ${finding.file}` : "";
    return `## ${finding.id} [${finding.severity}] ${finding.title}${file}\n\n${finding.body}`;
  });

  if (note.trim()) blocks.push(`## Note\n\n${note.trim()}`);
  return blocks.join("\n\n");
}
