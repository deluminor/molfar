import type { Attachment } from "@/domain/session/attachment";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import {
  LaunchChoiceError,
  launchOptions,
  launchText,
  resolveLaunchChoice,
} from "@/features/sessions/model/launch-choice";
import { pathKey } from "@/shared/lib/paths";
import type { CompanionSessionOptions } from "./protocol";

export class CompanionLaunchError extends LaunchChoiceError {}

/** What a phone may pick for a new session in one project, with its defaults. */
export function companionSessionOptions(
  project: string,
  defaultRuntimeMode: RuntimeMode,
): CompanionSessionOptions {
  return launchOptions(project, defaultRuntimeMode);
}

/**
 * A new project session from the phone, checked like the `app` CLI's
 * `sessions.start`: a rail project, an installed provider, a known model and
 * effort, and one of the four permission modes. It never takes the user's
 * desktop focus.
 */
export function companionLaunch(
  input: Record<string, unknown>,
  context: {
    projects: readonly string[];
    defaultRuntimeMode: RuntimeMode;
    attachments: Attachment[];
    prompt: string;
  },
): QuickLaunch {
  const requested = launchText(input.project, "project", 4096);
  const cwd = context.projects.find(
    (path) => requested && pathKey(path) === pathKey(requested),
  );
  if (!cwd) throw new CompanionLaunchError("Choose one of the projects on the rail");

  const choice = resolveLaunchChoice(cwd, input, context.defaultRuntimeMode);

  const workspaceMode = input.workspaceMode ?? "current";
  if (workspaceMode !== "current" && workspaceMode !== "worktree")
    throw new CompanionLaunchError("workspaceMode must be current or worktree");

  return {
    cwd,
    prompt: context.prompt,
    ...choice,
    workspaceMode,
    ...(context.attachments.length ? { attachments: context.attachments } : {}),
    reveal: false,
  };
}
