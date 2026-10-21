import type { AppHarness, IpcCall } from "./app-harness";

const PERSIST_COMMANDS = new Set([
  "session_upsert",
  "workspace_set_snapshot",
  "session_set_in_flight",
  "hide_window",
  "destroy_window",
  "harness_kill_all",
  "quit_ready",
  "quit_poll_reply",
]);

/**
 * Persistence and window commands sent since call `from`, in order, duplicates
 * folded, up to and including `last`: the debounced background save may still
 * land after it under load.
 */
export function persistOrder(app: AppHarness, from: number, last?: string): string[] {
  const order: string[] = [];
  for (const call of app.calls.slice(from)) {
    if (!PERSIST_COMMANDS.has(call.command)) continue;
    if (order[order.length - 1] !== call.command) order.push(call.command);
    if (call.command === last) break;
  }
  return order;
}

export function callsSince(app: AppHarness, from: number, command: string): IpcCall[] {
  return app.calls.slice(from).filter((call) => call.command === command);
}

/** Sends `prompt` and leaves its turn running. */
export async function startTurn(app: AppHarness, prompt: string): Promise<void> {
  const turnsBefore = app.harness.turns.length;
  await app.submitPrompt(prompt);
  await app.until(() => app.harness.turns.length > turnsBefore);
}

/** The window's close button, as Tauri reports it. */
export async function requestWindowClose(app: AppHarness): Promise<void> {
  await app.emit("tauri://close-requested", {});
}

type UpsertedSession = { id: string; blocks: { text?: string; notice?: string }[] };

export function upsertedSessions(app: AppHarness, from: number): UpsertedSession[] {
  return callsSince(app, from, "session_upsert").map(
    (call) => (call.args as { session: UpsertedSession }).session,
  );
}

export function markedInterrupted(session: UpsertedSession): boolean {
  return session.blocks[session.blocks.length - 1]?.notice === "interrupt";
}

/** Text of the open app dialog, which renders outside the app's root. */
export function dialogText(): string | undefined {
  return document.querySelector('[role="alertdialog"], [role="dialog"]')?.textContent ?? undefined;
}

/** Clicks a button of the open app dialog. */
export async function answerDialog(app: AppHarness, label: string): Promise<void> {
  const find = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button, [role="dialog"] button')].find(
      (button) => button.textContent?.trim() === label,
    );
  await app.until(() => !!find());
  await app.drive(() => find()?.click());
}
