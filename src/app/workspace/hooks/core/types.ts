import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { InstalledUpdate } from "@/features/updates/model/update-notice";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WindowTransferPayload } from "../../../model/window-transfer";

export type WorkspaceProps = {
  windowTransfer?: WindowTransferPayload | null;
  resumed?: ResumedWorkspace | null;
  installedUpdate?: InstalledUpdate | null;
  history?: SessionSummary[];
  historyCwd?: string | null;
};
