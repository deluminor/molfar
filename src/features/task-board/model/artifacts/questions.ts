import type { GrillAnswer, GrillQuestion } from "../../types/artifact";

const HEADING = /^##\s+Q(\d+)\s*(?:[—–:-]\s*)?(.*)$/;
const RECOMMENDED = /^\*\*Recommended:?\*\*:?\s*/i;

function sections(markdown: string): { number: number; title: string; lines: string[] }[] {
  const result: { number: number; title: string; lines: string[] }[] = [];
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      result.push({ number: Number(heading[1]), title: heading[2].trim(), lines: [] });
      continue;
    }
    result[result.length - 1]?.lines.push(line);
  }
  return result;
}

export function parseQuestions(markdown: string): GrillQuestion[] {
  return sections(markdown).map(({ number, title, lines }) => {
    const index = lines.findIndex((line) => RECOMMENDED.test(line.trim()));
    const bodyLines = index < 0 ? lines : lines.slice(0, index);
    const recommended =
      index < 0
        ? ""
        : [lines[index].trim().replace(RECOMMENDED, ""), ...lines.slice(index + 1)]
            .join("\n")
            .trim();
    return { number, title, body: bodyLines.join("\n").trim(), recommended };
  });
}

/** `answers-<n>.md`: one section per question, plus an optional free note. */
export function formatAnswers(
  questions: readonly GrillQuestion[],
  answers: readonly GrillAnswer[],
  note: string,
): string {
  const byNumber = new Map(answers.map((entry) => [entry.number, entry.answer.trim()]));
  const blocks = questions.map((question) => {
    const answer = byNumber.get(question.number) || question.recommended || "(no answer)";
    return `## Q${question.number} — ${question.title}\n\n**Answer:** ${answer}`;
  });

  if (note.trim()) blocks.push(`## Note\n\n${note.trim()}`);
  return blocks.join("\n\n");
}
