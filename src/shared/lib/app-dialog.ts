export type AppDialogKind = "info" | "warning" | "error";

export type AlertAppOptions = {
  title?: string;
  kind?: AppDialogKind;
};

export type ConfirmAppOptions = {
  title?: string;
  kind?: AppDialogKind;
  okLabel?: string;
  cancelLabel?: string;
};

export type AppDialogState = {
  id: number;
  mode: "alert" | "confirm";
  title: string;
  body: string;
  kind: AppDialogKind;
  okLabel: string;
  cancelLabel: string;
};

type PendingAlert = AppDialogState & {
  mode: "alert";
  resolve: () => void;
};

type PendingConfirm = AppDialogState & {
  mode: "confirm";
  resolve: (ok: boolean) => void;
};

type Pending = PendingAlert | PendingConfirm;

const DEFAULT_TITLE = "MOLFAR";
const DEFAULT_OK = "OK";
const DEFAULT_CANCEL = "Cancel";

let nextId = 1;
let active: Pending | null = null;
let snapshot: AppDialogState | null = null;
const queue: Pending[] = [];
const listeners = new Set<() => void>();

function toState(pending: Pending): AppDialogState {
  const { id, mode, title, body, kind, okLabel, cancelLabel } = pending;
  return { id, mode, title, body, kind, okLabel, cancelLabel };
}

function show(next: Pending | null): void {
  active = next;
  snapshot = next ? toState(next) : null;
  for (const listener of listeners) listener();
}

function enqueue(next: Pending): void {
  if (active) {
    queue.push(next);
    return;
  }

  show(next);
}

export function subscribeAppDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns a stable reference until the active dialog changes (`useSyncExternalStore` snapshot). */
export function getAppDialog(): AppDialogState | null {
  return snapshot;
}

/** Resolve dialog `id` if it is still active, so a stale double-click cannot settle the next one. Alerts ignore `ok`. */
export function settleAppDialog(id: number, ok: boolean): void {
  const current = active;
  if (current?.id !== id) return;

  if (current.mode === "alert") current.resolve();
  else current.resolve(ok);

  show(queue.shift() ?? null);
}

export function alertApp(
  body: string,
  options: AlertAppOptions = {},
): Promise<void> {
  return new Promise((resolve) => {
    enqueue({
      id: nextId++,
      mode: "alert",
      title: options.title ?? DEFAULT_TITLE,
      body,
      kind: options.kind ?? "info",
      okLabel: DEFAULT_OK,
      cancelLabel: DEFAULT_CANCEL,
      resolve,
    });
  });
}

export function confirmApp(
  body: string,
  options: ConfirmAppOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({
      id: nextId++,
      mode: "confirm",
      title: options.title ?? DEFAULT_TITLE,
      body,
      kind: options.kind ?? "warning",
      okLabel: options.okLabel ?? DEFAULT_OK,
      cancelLabel: options.cancelLabel ?? DEFAULT_CANCEL,
      resolve,
    });
  });
}
