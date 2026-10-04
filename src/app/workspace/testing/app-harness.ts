import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { vi } from "vitest";
import type { HarnessId } from "@/domain/harness/harness";
import type { HarnessAdapter } from "@/integrations/harness/core/registry";
import type {
  HarnessEvent,
  SendTurnInput,
  SteerTurnInput,
} from "@/integrations/harness/core/types";
import { defaultIpcAnswer } from "./ipc-defaults";

export type IpcArgs = Record<string, unknown> | undefined;
export type IpcRoute = (args: IpcArgs) => unknown;
export type IpcCall = { command: string; args: IpcArgs };

export type FakeHarness = {
  adapter: HarnessAdapter;
  turns: SendTurnInput[];
  steers: SteerTurnInput[];
  cancelled: string[];
  approvals: Array<{ sessionId: string; requestId: number; decision: string }>;
  /** Streams events into the running turn. */
  send(event: HarnessEvent): void;
  /** Settles the running turn. */
  finish(): void;
};

export type AppHarness = {
  host: HTMLElement;
  calls: IpcCall[];
  harness: FakeHarness;
  commands(name: string): IpcCall[];
  emit(event: string, payload?: unknown): Promise<void>;
  /** Runs harness or store actions inside act, then lets effects settle. */
  drive(action: () => void): Promise<void>;
  /** Text of what is on screen, without panes kept mounted behind aria-hidden. */
  visibleText(): string;
  /** Clicks the visible button whose text or aria-label is `label`. */
  click(label: string): Promise<void>;
  /** Types into the visible composer and presses Enter. */
  submitPrompt(text: string): Promise<void>;
  settle(ms?: number): Promise<void>;
  /** Lets React work until `condition` holds; fails after `timeoutMs`. */
  until(condition: () => boolean, timeoutMs?: number): Promise<void>;
  unmount(): Promise<void>;
};

/** A live harness that records turns and lets the test drive their events. */
export function createFakeHarness(id: HarnessId): FakeHarness {
  const turns: SendTurnInput[] = [];
  const steers: SteerTurnInput[] = [];
  const cancelled: string[] = [];
  const approvals: FakeHarness["approvals"] = [];
  let finishTurn: (() => void) | undefined;
  const adapter: HarnessAdapter = {
    id,
    live: true,
    sendTurn: (input) => {
      turns.push(input);
      return new Promise<void>((resolve) => {
        finishTurn = resolve;
      });
    },
    steerTurn: async (input) => {
      steers.push(input);
    },
    cancelTurn: async (sessionId) => {
      cancelled.push(sessionId);
      finishTurn?.();
    },
    respondApproval: (sessionId, requestId, decision) => {
      approvals.push({ sessionId, requestId, decision });
    },
    stopSession: async () => {},
    forgetSession: async () => {},
    bindSession: () => {},
  };

  return {
    adapter,
    turns,
    steers,
    cancelled,
    approvals,
    send(event) {
      const turn = turns[turns.length - 1];
      if (!turn) throw new Error("No running turn to send an event into");
      turn.onEvent(event);
    },
    finish() {
      finishTurn?.();
      finishTurn = undefined;
    },
  };
}

/**
 * Renders the real app against mocked Tauri IPC, windows and events. Modules
 * are reset first, so module-level stores start empty for every call.
 */
export async function renderApp(
  options: {
    routes?: Record<string, IpcRoute>;
    harness?: HarnessId;
    /** Project the app reopens on launch; none boots into `~`. */
    project?: string;
  } = {},
): Promise<AppHarness> {
  vi.resetModules();
  localStorage.clear();

  const calls: IpcCall[] = [];
  const routes: Record<string, IpcRoute> = {
    resolve_project_location: (args) => ({
      path: args?.path,
      identity: args?.identity ?? args?.path,
    }),
    ...options.routes,
  };
  mockWindows("main");
  mockIPC(
    (command, args) => {
      const payload = args as IpcArgs;
      calls.push({ command, args: payload });
      const route = routes[command];
      return route ? route(payload) : defaultIpcAnswer(command);
    },
    { shouldMockEvents: true },
  );

  if (options.project) {
    const recents = await import("@/features/projects/model/recents");
    recents.rememberProject(options.project);
  }

  const { default: App } = await import("@/app/App");
  const registry = await import("@/integrations/harness/core/registry");
  const harness = createFakeHarness(options.harness ?? "cursor");
  registry.registerHarness(harness.adapter);

  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(createElement(App, {}));
  });

  const settle = async (ms = 50) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };
  const until = async (condition: () => boolean, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline)
        throw new Error(`Condition not met within ${timeoutMs}ms`);
      await settle(25);
    }
  };
  const visibleComposer = () =>
    [
      ...host.querySelectorAll<HTMLTextAreaElement>(
        "textarea.composer-field:not([disabled])",
      ),
    ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));

  // Booting is IPC-driven and its timing depends on machine load.
  await until(() => !!visibleComposer());
  await settle();

  return {
    host,
    calls,
    harness,
    commands: (name) => calls.filter((call) => call.command === name),
    emit: async (event, payload) => {
      await act(async () => {
        await emit(event, payload);
      });
      await settle();
    },
    drive: async (action) => {
      await act(async () => {
        action();
      });
      await settle();
    },
    visibleText: () => {
      const copy = host.cloneNode(true) as HTMLElement;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
        hidden.remove();
      }
      return copy.textContent ?? "";
    },
    click: async (label) => {
      const find = () =>
        [...host.querySelectorAll<HTMLElement>("button")].find(
          (candidate) =>
            !candidate.closest('[aria-hidden="true"]') &&
            (candidate.getAttribute("aria-label") === label ||
              candidate.textContent?.trim() === label),
        );
      await until(() => !!find());
      const button = find();
      if (!button) throw new Error(`No visible button labelled "${label}"`);
      await act(async () => {
        button.click();
      });
      await settle();
    },
    submitPrompt: async (text) => {
      await until(() => !!visibleComposer());
      const field = visibleComposer();
      if (!field) throw new Error("No enabled composer on screen");
      await act(async () => {
        field.focus();
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      await settle();
    },
    settle,
    until,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      clearMocks();
    },
  };
}
