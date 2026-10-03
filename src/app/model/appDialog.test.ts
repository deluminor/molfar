import { afterEach, describe, expect, it } from "vitest";
import {
  alertApp,
  confirmApp,
  getAppDialog,
  settleAppDialog,
  subscribeAppDialog,
} from "./appDialog";

function settleActive(ok: boolean): void {
  const dialog = getAppDialog();
  if (dialog) settleAppDialog(dialog.id, ok);
}

afterEach(() => {
  while (getAppDialog()) settleActive(false);
});

describe("appDialog", () => {
  it("surfaces an alert and resolves on settle", async () => {
    const pending = alertApp("Hello", { title: "Notice", kind: "error" });

    expect(getAppDialog()).toMatchObject({
      mode: "alert",
      title: "Notice",
      body: "Hello",
      kind: "error",
      okLabel: "OK",
      cancelLabel: "Cancel",
    });

    settleActive(true);
    await expect(pending).resolves.toBeUndefined();
    expect(getAppDialog()).toBeNull();
  });

  it("resolves confirms with the settle choice", async () => {
    const pending = confirmApp("Delete?", {
      title: "Remove",
      okLabel: "Remove",
      cancelLabel: "Keep",
    });

    expect(getAppDialog()?.mode).toBe("confirm");
    expect(getAppDialog()?.okLabel).toBe("Remove");

    settleActive(false);
    await expect(pending).resolves.toBe(false);
  });

  it("queues a second dialog until the first settles", async () => {
    const first = alertApp("one");
    const second = confirmApp("two");
    const seen: Array<string | null> = [];

    const stop = subscribeAppDialog(() => {
      seen.push(getAppDialog()?.body ?? null);
    });

    expect(getAppDialog()?.body).toBe("one");
    expect(seen).toEqual([]);

    settleActive(true);
    await first;

    expect(getAppDialog()?.body).toBe("two");
    expect(seen).toContain("two");

    settleActive(true);
    await expect(second).resolves.toBe(true);
    expect(getAppDialog()).toBeNull();

    stop();
  });

  it("keeps the snapshot stable until the active dialog changes", () => {
    void alertApp("stable");

    const first = getAppDialog();
    expect(getAppDialog()).toBe(first);

    settleActive(true);
    expect(getAppDialog()).toBeNull();
  });

  it("ignores a stale settle aimed at an already closed dialog", async () => {
    const first = confirmApp("one");
    const second = confirmApp("two");
    const firstId = getAppDialog()?.id ?? -1;

    settleAppDialog(firstId, true);
    settleAppDialog(firstId, true);

    await expect(first).resolves.toBe(true);
    expect(getAppDialog()?.body).toBe("two");

    settleActive(false);
    await expect(second).resolves.toBe(false);
  });
});
