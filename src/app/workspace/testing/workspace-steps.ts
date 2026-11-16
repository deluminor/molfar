import type { AppHarness } from "./app-harness";

/** Ids of the title bar's tabs, in order. */
export function tabIds(app: AppHarness): string[] {
  return [...app.host.querySelectorAll<HTMLElement>("[data-title-tab-id]")].map(
    (tab) => tab.dataset.titleTabId ?? "",
  );
}

export function shows(app: AppHarness, text: string): boolean {
  return app.visibleText().includes(text);
}

/** Sends `prompt` and streams `reply` back, so the tab holds an answered session. */
export async function answeredSession(
  app: AppHarness,
  prompt: string,
  reply: string,
): Promise<void> {
  const harness = app.harness;
  const turnsBefore = harness.turns.length;
  await app.submitPrompt(prompt);
  await app.until(() => harness.turns.length > turnsBefore);
  await app.drive(() => {
    harness.send({ type: "message.delta", text: reply });
    harness.send({ type: "message.completed" });
    harness.finish();
  });
  await app.until(() => shows(app, reply));
}
