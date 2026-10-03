import type { UpdaterSnapshot } from "./updater";

export type UpdatePrompt = {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
  onProgress?: (snapshot: UpdaterSnapshot) => void;
};

let prompt: UpdatePrompt | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeUpdatePrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdatePrompt(): UpdatePrompt | null {
  return prompt;
}

export function openUpdatePrompt(next: UpdatePrompt): void {
  if (prompt?.version === next.version) return;

  prompt = next;
  notify();
}

export function closeUpdatePrompt(): void {
  if (!prompt) return;

  prompt = null;
  notify();
}
