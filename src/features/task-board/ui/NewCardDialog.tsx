import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/shared/ui/Modal";
import type { NewCard } from "../services/card-create";
import { FIELD, FIELD_LABEL, PRIMARY_BUTTON, QUIET_BUTTON } from "./button-styles";
import { ProjectFilterMenu } from "./ProjectFilterMenu";

type Props = {
  projects: readonly string[];
  initialProject: string | null;
  onCreate: (input: NewCard) => Promise<void>;
  onClose: () => void;
};

export function NewCardDialog({ projects, initialProject, onCreate, onClose }: Props): ReactNode {
  const titleRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState(initialProject ?? projects[0] ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(project && title.trim() && description.trim()) && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ projectCwd: project, title, description, acceptanceCriteria: criteria, baseRef: baseRef || null });
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  return (
    <Modal title="New task" size="md" onClose={onClose} initialFocusRef={titleRef}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 px-4 pb-4 pt-3">
        <div className={FIELD_LABEL}>
          Project
          <ProjectFilterMenu projects={projects} project={project || null} onChange={(next) => setProject(next ?? "")} allowAll={false} block />
        </div>

        <label className={FIELD_LABEL}>
          Title
          <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className={FIELD} />
        </label>

        <label className={FIELD_LABEL}>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            className={`${FIELD} resize-y leading-5`}
          />
        </label>

        <label className={FIELD_LABEL}>
          Acceptance criteria <span className="text-content/35">optional; Grill derives them otherwise</span>
          <textarea
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
            rows={3}
            className={`${FIELD} resize-y leading-5`}
          />
        </label>

        <label className={FIELD_LABEL}>
          Base branch <span className="text-content/35">optional; defaults to the project's default branch</span>
          <input
            value={baseRef}
            onChange={(event) => setBaseRef(event.target.value.trim())}
            placeholder="main"
            spellCheck={false}
            className={`${FIELD} font-mono`}
          />
        </label>

        {error ? (
          <p role="alert" className="text-[12px] leading-5 text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={QUIET_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={!ready} className={PRIMARY_BUTTON}>
            {busy ? "Creating…" : "Add to backlog"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
