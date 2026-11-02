import type { Dispatch, RefObject, SetStateAction } from "react";
import type { HarnessId } from "@/domain/harness/harness";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import type { UserQuestionReply } from "@/domain/session/user-question";
import type { Submit } from "../submission/submit-types";

export type MobileCommandDeps = {
  sessionsRef: RefObject<Session[]>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  defaultRuntimeMode?: RuntimeMode;
  submit: Submit;
  ensureOpen: (sessionId: string) => Promise<Session | null | undefined>;
  rename: (sessionId: string, title: string) => Promise<unknown>;
  remove: (
    sessionId: string,
    mode: "archive" | "delete",
    skipConfirm: boolean,
    origin: "cli",
  ) => Promise<boolean>;
  stop: (sessionId: string) => unknown;
  answer: (
    sessionId: string,
    requestId: number,
    reply: UserQuestionReply,
  ) => void;
  keepQuestionOpen: (sessionId: string, requestId: number) => void;
  changeModel: (sessionId: string, harness: HarnessId, model: string) => void;
  changeModelSettings: (
    sessionId: string,
    modelSettings: Record<string, string>,
  ) => void;
  changeRuntimeMode: (sessionId: string, runtimeMode: RuntimeMode) => void;
};
