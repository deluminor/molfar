import type { Dispatch, SetStateAction } from "react";
import type { Attachment } from "@/domain/session/attachment";
import type { Session } from "@/domain/session/session";
import type { AppSessionPlacement } from "@/features/agent-app/model/agent-app";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import type { TaskBoardRuntime } from "@/features/task-board/hooks/use-task-board-engine";
import type { createFamiliarCompletions } from "../familiars/familiar-completions";
import type { Submit } from "../submission/submit-types";

/** What the app CLI reaches in the workspace, as App holds it. */
export type AgentAppDeps = {
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  turnGen: { readonly current: Map<string, number> };
  removingSessionIds: { readonly current: Set<string> };
  switchingWorktrees: { readonly current: Map<string, string> };
  completions: ReturnType<typeof createFamiliarCompletions>["batches"];
  board(): TaskBoardRuntime;
  flushHarnessEvents(): void;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  submitSession: Submit;
  saveDraft(sessionId: string, text: string, attachments?: Attachment[], appRequestId?: string): boolean;
  stopSession(sessionId: string): unknown;
  removeSession(
    sessionId: string,
    mode: "archive" | "delete",
    skipDeleteConfirm: boolean,
    origin: "ui" | "cli",
  ): Promise<boolean>;
  launchQuickSession(
    launch: QuickLaunch,
    deliveryId: string,
    placement?: AppSessionPlacement,
    onSettled?: (outcome: ControlOutcome) => void,
    openTab?: boolean,
  ): Promise<unknown>;
};
