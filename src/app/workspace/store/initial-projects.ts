import type { ResumedWorkspace } from "@/features/sessions/model/in-flight";
import {
  lastProjectPath,
  loadRecents,
  looksLikeProject,
  rememberProject,
} from "@/features/projects/model/recents";
import type { WindowTransferPayload } from "../../model/window-transfer";
import type { ProjectsState } from "./projects-slice";

/**
 * The project a window opens on: the transferred or resumed one, else the
 * last opened. A resumed project is remembered again so it leads the recents.
 */
export function initialProjectsState(boot: {
  windowTransfer: Pick<WindowTransferPayload, "projectCwd"> | null;
  resumed: Pick<ResumedWorkspace, "projectCwd"> | null;
}): ProjectsState {
  const { windowTransfer, resumed } = boot;
  const projectCwd =
    windowTransfer?.projectCwd ??
    resumed?.projectCwd ??
    lastProjectPath() ??
    "~";
  const recents =
    resumed?.projectCwd && looksLikeProject(resumed.projectCwd)
      ? rememberProject(resumed.projectCwd)
      : loadRecents();

  return { projectCwd, recents };
}
