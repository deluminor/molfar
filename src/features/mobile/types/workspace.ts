import type { Session } from "@/domain/session/session";
import type { RuntimeMode } from "@/domain/session/runtime-mode";

export type MobileRequest = {
  id: string;
  commandId: string;
  method: string;
  params: Record<string, unknown>;
};
export type MobileWatchEvent =
  | {
      id: string;
      action: "start";
      conversationId: string;
      /** How many of the latest turns to open on. */
      tail?: number | null;
      /** The first turn the phone already has, to carry on from instead. */
      from?: string | null;
      incremental?: boolean;
    }
  | { id: string; action: "stop" };
export type MobileWorkspaceOptions = {
  sessions: readonly Session[];
  /** The permission mode a new desktop tab would start with. */
  defaultRuntimeMode?: RuntimeMode;
  command: (
    method: string,
    params: Record<string, unknown>,
    commandId: string,
  ) => Promise<unknown>;
};
