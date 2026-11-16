import { useState, useSyncExternalStore } from "react";
import {
  closeUpdatePrompt,
  getUpdatePrompt,
  subscribeUpdatePrompt,
  type UpdatePrompt,
} from "@/features/updates/model/update-prompt";
import { installFromPrompt } from "@/features/updates/model/update-prompt-install";
import type { UpdaterSnapshot } from "@/features/updates/model/updater";
import { ReleaseNotesDialog } from "./ReleaseNotesDialog";
import { UpdatePromptFooter } from "./UpdatePromptFooter";

export function UpdatePromptDialog() {
  const prompt = useSyncExternalStore(
    subscribeUpdatePrompt,
    getUpdatePrompt,
    getUpdatePrompt,
  );
  if (!prompt) return null;

  return <UpdatePromptModal key={prompt.version} prompt={prompt} />;
}

function UpdatePromptModal({ prompt }: { prompt: UpdatePrompt }) {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot | null>(null);

  const onClose = () => {
    if (snapshot?.phase !== "downloading") closeUpdatePrompt();
  };

  const onInstall = () => {
    void installFromPrompt(prompt, setSnapshot);
  };

  const description = [
    `MOLFAR ${prompt.version}`,
    prompt.date,
    `you have ${prompt.currentVersion}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReleaseNotesDialog
      title="Update available"
      description={description}
      label={`Release notes for MOLFAR ${prompt.version}`}
      markdown={prompt.notes}
      onClose={onClose}
      footer={
        <UpdatePromptFooter
          snapshot={snapshot}
          onLater={onClose}
          onInstall={onInstall}
        />
      }
    />
  );
}
