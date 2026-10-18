import { useMemo, useState, type ReactNode } from "react";
import { parseQuestions } from "../../model/artifacts/questions";
import type { GrillAnswer } from "../../types/artifact";
import { FIELD, OUTLINE_BUTTON, PRIMARY_BUTTON } from "../button-styles";

type Props = {
  /** Latest questions markdown; empty when Grill asked nothing. */
  markdown: string;
  editable: boolean;
  /** Opens straight into the note, e.g. after dropping the card on Grill. */
  focusNote: boolean;
  onAnswer: (answers: GrillAnswer[], note: string) => Promise<void>;
  onRequestChanges: (note: string) => Promise<void>;
};

/** Grill's open questions with its recommendations prefilled, plus a free note. */
export function QuestionsForm({ markdown, editable, focusNote, onAnswer, onRequestChanges }: Props): ReactNode {
  const questions = useMemo(() => parseQuestions(markdown), [markdown]);
  const [answers, setAnswers] = useState(() => new Map(questions.map((question) => [question.number, question.recommended])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const collected = (): GrillAnswer[] =>
    questions.map((question) => ({ number: question.number, answer: answers.get(question.number) ?? "" }));

  return (
    <div className="flex flex-col gap-4">
      {questions.map((question) => (
        <section key={question.number} className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-medium text-content">
            Q{question.number} · {question.title}
          </h3>
          {question.body ? <p className="whitespace-pre-wrap text-[12px] leading-5 text-content/60">{question.body}</p> : null}
          <textarea
            aria-label={`Answer to question ${question.number}`}
            value={answers.get(question.number) ?? ""}
            disabled={!editable}
            onChange={(event) => setAnswers((previous) => new Map(previous).set(question.number, event.target.value))}
            rows={2}
            className={`${FIELD} resize-y leading-5`}
          />
        </section>
      ))}

      <label className="flex flex-col gap-1.5 text-[12px] text-content/60">
        Note for the next grill round {questions.length ? "(optional)" : ""}
        <textarea
          value={note}
          disabled={!editable}
          autoFocus={focusNote}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="What should change in the spec or plan?"
          className={`${FIELD} resize-y leading-5`}
        />
      </label>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          {questions.length ? (
            <button type="button" disabled={busy} onClick={() => void run(() => onAnswer(collected(), note))} className={PRIMARY_BUTTON}>
              Answer & re-grill
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => void run(() => onRequestChanges(note))}
            className={OUTLINE_BUTTON}
          >
            Request changes
          </button>
        </div>
      ) : null}
    </div>
  );
}
