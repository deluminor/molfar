import type { ReactNode } from "react";
import { AgentMarkdown } from "@/features/sessions/ui/AgentMarkdown";
import { Modal } from "@/shared/ui/Modal";

type ReleaseNotesDialogProps = {
  title: string;
  description: string;
  label: string;
  markdown: string | null;
  footer?: ReactNode;
  onClose: () => void;
};

export function ReleaseNotesBody({
  label,
  markdown,
}: {
  label: string;
  markdown: string | null;
}) {
  return (
    <article aria-label={label} className="px-5 py-4">
      {markdown ? (
        <AgentMarkdown
          className="whats-new-md"
          text={markdown}
          streaming={false}
        />
      ) : (
        <p className="text-[13px] text-content/60">
          Release notes for this version are not available in this build.
        </p>
      )}
    </article>
  );
}

export function ReleaseNotesDialog({
  title,
  description,
  label,
  markdown,
  footer,
  onClose,
}: ReleaseNotesDialogProps) {
  return (
    <Modal
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      className="h-[min(72vh,640px)]"
      footer={footer}
    >
      <ReleaseNotesBody label={label} markdown={markdown} />
    </Modal>
  );
}
