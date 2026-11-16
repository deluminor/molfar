import { useLayoutEffect } from "react";
import { HARNESSES } from "@/domain/harness/harness";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { isHarnessAvailable } from "@/integrations/harness/core/availability";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import { createWorker } from "../flows/orchestration-workers/create-worker";
import { cleanupWorker, integrateWorker } from "../flows/orchestration-workers/worker-checkout";
import {
  answerWorkerApproval,
  answerWorkerQuestion,
  steerWorker,
  stopWorker,
  submitToWorker,
} from "../flows/orchestration-workers/worker-control";
import { findSession, type WorkerDeps } from "../flows/orchestration-workers/worker-deps";

/** Hands the orchestrator the workspace it runs its workers in; rebinds when `submitSession` changes. */
export function useOrchestratorBinding(deps: Omit<WorkerDeps, "submitSession">, submitSession: WorkerDeps["submitSession"]): void {
  useLayoutEffect(() => {
    const host: WorkerDeps = { ...deps, submitSession };
    orchestrator.bind({
      session: (id) => findSession(host, id),
      sessions: () => host.sessionsRef.current,
      choices: () =>
        HARNESSES.filter(isHarnessAvailable).map((harness) => ({
          harness,
          models: modelsFor(harness).map(({ id, name }) => ({ id, name })),
        })),
      createWorker: (run, task) => createWorker(host, run, task),
      integrateWorker: (run, task) => integrateWorker(host, run, task),
      cleanupWorker: (run, task, onlyIfUnchanged) => cleanupWorker(host, run, task, onlyIfUnchanged),
      submit: (id, text, done) => submitToWorker(host, id, text, done),
      steer: (id, text) => steerWorker(host, id, text),
      respondApproval: (id, requestId, decision) => answerWorkerApproval(host, id, requestId, decision),
      answerQuestion: (id, requestId, reply) => answerWorkerQuestion(host, id, requestId, reply),
      stop: (id) => stopWorker(host, id),
    });
  }, [deps, submitSession]);
}
