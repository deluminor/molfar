import { sessionDraftBlock } from "@/domain/session/session-state";
import type { AppSessionPlacement } from "@/features/agent-app/model/agent-app";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import { getSession } from "@/features/sessions/data/session-store";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import type { AgentAppDeps } from "./agent-app-deps";
import type { RequestSource } from "./agent-app-source";

/** Starts a session for the CLI, once per request id. */
export async function startAppSession(
  deps: AgentAppDeps,
  request: RequestSource,
  launch: QuickLaunch,
  id: string,
  placement?: AppSessionPlacement,
  notifyFamiliarId?: string,
): Promise<void> {
  const open = deps.sessionsRef.current.find((session) => session.id === id);
  const existing = open ?? (await getSession(id));
  const rememberLaunch = () => {
    const created = deps.sessionsRef.current.find((session) => session.id === id) ?? existing;
    request.rememberSession({
      sessionId: id,
      cwd: created?.cwd ?? launch.cwd,
      title: created?.title ?? launch.prompt.trim().slice(0, 300),
      harness: created?.harness ?? launch.harness,
      model: created?.model ?? resolveModel(launch.harness, launch.model).id,
    });
  };

  const previous = existing?.blocks.find((block) => block.appRequestId === id);
  if (previous) {
    if (previous.text !== launch.prompt || (!launch.draft && !!previous.draft))
      throw new Error("Request ID was already used for another session launch");
    rememberLaunch();
    return;
  }
  if (existing?.blocks.some((block) => block.role === "user" && !block.draft)) {
    rememberLaunch();
    return;
  }
  if (existing && sessionDraftBlock(existing)) throw new Error("Session ID already has a different draft");

  const onSettled = notifyFamiliarId
    ? request.monitorCompletion(notifyFamiliarId, id, id, launch.cwd, launch.prompt)
    : undefined;
  try {
    // Started sessions wait in the sidebar, under the session that started
    // them, until the user opens one. Only an explicit split, or a reveal
    // from a regular session, puts one in the workspace.
    await deps.launchQuickSession(
      launch,
      id,
      placement,
      onSettled,
      !!placement || (!isFamiliarSession(request.source.id) && launch.reveal),
    );
    rememberLaunch();
    onSettled?.accept();
  } catch (error) {
    onSettled?.discard();
    throw error;
  }
}
