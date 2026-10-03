import {
  formatReleaseDate,
  presentReleaseNotes,
  releaseNotesTitle,
} from "../model/releaseNotes";
import { ReleaseNotesBody, ReleaseNotesDialog } from "./ReleaseNotesDialog";

type Props = {
  version: string;
  onClose: () => void;
};

export function WhatsNewBody({ version }: { version: string }) {
  const notes = presentReleaseNotes(version);

  return (
    <ReleaseNotesBody
      label={releaseNotesTitle(version)}
      markdown={notes?.markdown ?? null}
    />
  );
}

export function WhatsNewDialog({ version, onClose }: Props) {
  const notes = presentReleaseNotes(version);
  const date = notes?.date ? formatReleaseDate(notes.date) : null;

  return (
    <ReleaseNotesDialog
      title="What's new"
      description={`MOLFAR ${version}${date ? ` · ${date}` : ""}`}
      label={releaseNotesTitle(version)}
      markdown={notes?.markdown ?? null}
      onClose={onClose}
    />
  );
}
