import type { UpdatePrompt } from "./update-prompt";
import { installPendingUpdate, type UpdaterSnapshot } from "./updater";

export async function installFromPrompt(
  prompt: UpdatePrompt,
  onSnapshot: (snapshot: UpdaterSnapshot) => void,
): Promise<void> {
  const result = await installPendingUpdate(
    (next) => {
      onSnapshot(next);
      prompt.onProgress?.(next);
    },
    { reportFailure: false, version: prompt.version },
  );

  // An install already running elsewhere returns without reporting progress.
  onSnapshot(result);
}
