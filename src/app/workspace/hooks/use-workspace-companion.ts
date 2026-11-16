import { useMemo } from "react";
import { useCompanionBridge } from "@/features/companion/hooks/use-companion-bridge";
import { createCompanionBoard } from "@/features/companion/model/companion-board";
import type { CompanionDeps } from "@/features/companion/model/companion-executor";
import {
  companionProjectLabel,
  companionProjectPaths,
} from "@/features/companion/model/companion-projects";
import {
  readVaultNote,
  saveVaultNote,
  scanVault,
  vaultStatus,
} from "@/features/knowledge/model/vault/vault-client";
import { createNote, getNote, loadNotes, NOTES_CHANGED_EVENT } from "@/features/notes/notes";
import type { TaskBoardRuntime } from "@/features/task-board/hooks/use-task-board-engine";

export type WorkspaceCompanionDeps = Omit<
  CompanionDeps,
  "board" | "projects" | "projectLabel" | "vault" | "notes" | "submit"
> & {
  taskBoard: TaskBoardRuntime;
  /** Returns whether the turn was accepted, or the turn still being sent. */
  submit: (...args: Parameters<CompanionDeps["submit"]>) => boolean | Promise<unknown>;
};

/** Serves companion (phone) requests from this window's workspace. */
export function useWorkspaceCompanion({
  taskBoard,
  submit,
  ...deps
}: WorkspaceCompanionDeps): void {
  const board = useMemo(() => createCompanionBoard(taskBoard), [taskBoard]);

  useCompanionBridge({
    ...deps,
    board,
    projects: companionProjectPaths,
    projectLabel: companionProjectLabel,
    submit: (sessionId, text, attachments) => {
      const accepted = submit(sessionId, text, attachments);
      if (typeof accepted === "boolean") return accepted;
      void accepted.catch(() => undefined);
      return true;
    },
    vault: {
      status: vaultStatus,
      scan: scanVault,
      read: readVaultNote,
      save: saveVaultNote,
    },
    notes: {
      list: () => loadNotes(true),
      read: getNote,
      create: async (input) => {
        const note = await createNote(input);
        window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
        return note;
      },
    },
  });
}
