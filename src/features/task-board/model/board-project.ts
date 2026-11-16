import { pathKey } from "@/shared/lib/paths";

type Listener = () => void;

const KEY = "molfar.taskBoard.project";
const listeners = new Set<Listener>();

/** The project the board was last scoped to; `null` is All projects. */
export function savedBoardProject(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveBoardProject(project: string | null): void {
  try {
    if (project) localStorage.setItem(KEY, project);
    else localStorage.removeItem(KEY);
  } catch (error) {
    console.warn("Could not save the Task Board project", error);
  }

  for (const listener of listeners) listener();
}

export function subscribeBoardProject(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The saved project as the board lists it, or All projects once it is gone. The saved
 * choice is kept, so a project list that is still loading does not erase it.
 */
export function shownBoardProject(
  saved: string | null,
  projects: readonly string[],
): string | null {
  if (!saved) return null;

  const key = pathKey(saved);
  return projects.find((project) => pathKey(project) === key) ?? null;
}
