import { newAgentTab, openEditorTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkerDetailRequest } from "../../store/surfaces-slice";

/**
 * Every agent of a run shares one pane, the way files do: `openEditorTab`
 * focuses an open tab, adds to the pane already beside the lead, or splits
 * one off when there is none.
 */
export function workerDetailOpener(
  request: WorkerDetailRequest,
  cwd: string,
): (tab: WorkspaceTab) => WorkspaceTab {
  const files = request.workers.map((worker) =>
    newAgentTab(worker.title, cwd, {
      sessionId: worker.sessionId,
      leadId: request.leadId,
      harness: worker.harness,
    }),
  );
  return (tab) => {
    const opened = files.reduce((next, file) => openEditorTab(next, file), tab);
    // Leave the first worker focused so View agents lands on the start
    // of the run rather than the last tab added.
    return files[0] ? openEditorTab(opened, files[0]) : opened;
  };
}
