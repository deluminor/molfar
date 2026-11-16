import { mobileProjectGitAction } from "./mobile-git";

/** How long a git action may run before the phone is told to ask again; under
 *  the desktop's 25 second wait for a reply. */
const GIT_ACTION_WAIT_MS = 20_000;
const MAX_JOBS = 100;

type Job = { signature: string; result: Promise<unknown> };

/**
 * Git actions by command ID. Generating a message or pushing can outlast a
 * phone request, so the job keeps running and the phone asks again with the
 * same ID until it is done; asking again never runs it twice.
 */
export function createMobileGitJobs() {
  const jobs = new Map<string, Job>();

  const start = (commandId: string, params: Record<string, unknown>): Job => {
    if (jobs.size >= MAX_JOBS) {
      const oldest = jobs.keys().next().value;
      if (oldest) jobs.delete(oldest);
    }
    const result = mobileProjectGitAction(
      String(params.projectId ?? ""),
      typeof params.worktreePath === "string" ? params.worktreePath : undefined,
      params,
    );
    // Settled for the race below; a failure still reaches the phone.
    result.catch(() => {});
    const job = { signature: JSON.stringify(params), result };
    jobs.set(commandId, job);
    return job;
  };

  return async (commandId: string, params: Record<string, unknown>) => {
    const existing = jobs.get(commandId);
    if (existing && existing.signature !== JSON.stringify(params))
      throw new Error("Command ID was already used with different input");
    const job = existing ?? start(commandId, params);

    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      job.result,
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ pending: true }),
          GIT_ACTION_WAIT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  };
}
