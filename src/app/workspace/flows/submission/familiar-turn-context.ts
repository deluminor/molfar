import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@/domain/session/session";
import { familiarForSession, familiarLook } from "@/features/familiars/model/familiar";
import {
  FAMILIAR_PROMPT_VERSION,
  familiarContext,
  familiarTurn,
  loadFamiliarFiles,
  planAgentContext,
} from "@/features/familiars/model/familiar-files";
import { habitPostsContext, unseenHabitPosts } from "@/features/familiars/model/familiar-habits";
import { saveFamiliarRotation } from "@/features/familiars/model/familiar-rotation";
import { shellPath } from "@/features/orchestration/model/orchestration";
import { forgetHarnessSession, migrateFamiliarCodexSession } from "@/integrations/harness";
import { operatorAppContext } from "./operator-app-context";
import type { TurnContext } from "./turn-run";

/** A Familiar's full provider session is dropped; this turn starts a fresh one. */
async function rotateFamiliarSession({ deps, turn, setup, run }: TurnContext): Promise<void> {
  const { sessionId } = turn;
  const rotation = setup.familiarRotation;
  if (!rotation) return;

  if (run.current.harness === "codex" && run.current.providerSessionId) {
    await migrateFamiliarCodexSession({
      sessionId,
      threadId: run.current.providerSessionId,
      cwd: run.workCwd,
      providerAccountId: turn.providerAccountId,
    });
  }
  await forgetHarnessSession(run.current.harness, sessionId);
  const fresh = (session: Session) =>
    session.id === sessionId ? { ...session, providerSessionId: undefined, context: undefined } : session;
  run.current = fresh(run.current);
  deps.sessionsRef.current = deps.sessionsRef.current.map(fresh);
  deps.setSessions((prev) => prev.map(fresh));
  saveFamiliarRotation(sessionId, rotation.rotation);
}

/** The Familiar's soul and memory files, with who it is folded into the soul's hash. */
async function familiarFiles(turn: TurnContext["turn"]) {
  const record = turn.familiar ? familiarForSession(turn.sessionId) : undefined;
  const look = record ? familiarLook(record) : undefined;
  const files = record ? await loadFamiliarFiles(record.id).catch(() => undefined) : undefined;
  // Who it is counts as part of its soul: a rename or a change to its
  // projects is handed over too, and so is a change to the fixed rules.
  const handed = files &&
    look && {
      ...files,
      soulHash: `${files.soulHash}:${look.name}:${look.projects
        .map((project) => project.path)
        .join("|")}:${FAMILIAR_PROMPT_VERSION}`,
    };
  return { look, files, handed };
}

/**
 * Adds what the app tells the agent alongside the user's message: a
 * Familiar's soul, memory, rotation brief and unseen habit posts, and the app
 * CLI for /operator.
 */
export async function withAppContext(context: TurnContext, sendText: string) {
  const { turn, setup, run } = context;
  const { sessionId } = turn;
  await rotateFamiliarSession(context);

  // The agent's soul and memory live in its folder. A native session
  // is handed them once, and memory again only when it changes.
  const { look, files, handed } = await familiarFiles(turn);
  const agentPlan = handed ? planAgentContext(sessionId, run.current.providerSessionId, handed) : undefined;
  const handAgent = agentPlan ? agentPlan.soul : turn.familiarFirstTurn;

  // What the app adds to the user's message rather than them.
  const appContext: string[] = [];
  if (setup.familiarRotation) appContext.push(setup.familiarRotation.brief(sessionId));
  // Habit posts land in the chat outside any turn, so the Familiar's
  // session has not seen them; the next message carries them once.
  const habitPosts = turn.familiar ? unseenHabitPosts(run.current.blocks) : [];
  if (habitPosts.length) appContext.push(habitPostsContext(habitPosts));
  if (files && look && agentPlan && (agentPlan.soul || agentPlan.memory)) {
    appContext.push(familiarContext(look, files, agentPlan));
  }
  if (turn.operatorCommand.matched || handAgent) {
    const cli = `${shellPath(await invoke<string>("app_cli_path"))} app`;
    appContext.push(operatorAppContext(cli, handAgent));
  }

  // A Familiar reads who it is ahead of the message, so it never takes it
  // for something the user pasted. A command must stay first.
  let text = sendText;
  if (turn.familiar && !turn.rawCommand) text = familiarTurn(sendText, appContext);
  else if (appContext.length) text += `\n\n${appContext.join("\n\n")}`;
  return { text, agentFiles: files, handedFiles: handed };
}
