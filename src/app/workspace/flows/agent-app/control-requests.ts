import { handleAgentApp } from "@/features/agent-app/model/agent-app";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import type { AgentAppDeps } from "./agent-app-deps";
import { agentAppHost } from "./agent-app-host";
import { createRequestSource } from "./agent-app-source";

export type ControlRequest = {
  id: string;
  namespace: string;
  sessionId: string;
  requestId: string;
  action: string;
  input: Record<string, unknown>;
};

const MAX_RECEIPTS = 256;

/**
 * Answers the app CLI and the orchestrator's control CLI. A retried request
 * id gets the first answer back; reusing it with other input is refused.
 */
export function createControlRequests(deps: AgentAppDeps) {
  const receipts = new Map<string, { signature: string; promise: Promise<unknown> }>();

  const remember = (key: string, signature: string, promise: Promise<unknown>) => {
    receipts.set(key, { signature, promise });
    void promise.catch(() => {
      if (receipts.get(key)?.promise === promise) receipts.delete(key);
    });
    if (receipts.size > MAX_RECEIPTS) {
      const first = receipts.keys().next().value;
      if (first) receipts.delete(first);
    }
  };

  const handleApp = (payload: ControlRequest): Promise<unknown> => {
    const source = deps.sessionsRef.current.find((session) => session.id === payload.sessionId);
    if (!source || source.inboxAsk || source.orchestrationLeadId || orchestrator.run(source.id))
      throw new Error("This session cannot use the MOLFAR app CLI");

    const key = `${source.id}:${payload.requestId}`;
    const signature = JSON.stringify([payload.action, payload.input]);
    const previous = receipts.get(key);
    if (previous) {
      if (previous.signature !== signature) throw new Error("Request ID was already used with different input");
      return previous.promise;
    }

    const request = createRequestSource(deps, source);
    const promise = handleAgentApp(source, payload.requestId, payload.action, payload.input, agentAppHost(deps, request));
    remember(key, signature, promise);
    return promise;
  };

  return async (payload: ControlRequest): Promise<unknown> => {
    if (payload.namespace === "control")
      return orchestrator.handle(payload.sessionId, payload.requestId, payload.action, payload.input);
    if (payload.namespace !== "app") throw new Error("Unknown CLI namespace");
    return handleApp(payload);
  };
}

