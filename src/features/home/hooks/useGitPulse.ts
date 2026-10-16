import { useEffect, useState } from "react";
import { gitDiffIndex, gitHeadMessage } from "../../../platform/tauri/fs";
import { gitPulse, type GitPulse } from "../model/gitPulse";

export type GitPulseState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; pulse: GitPulse };

async function readGitPulse(cwd: string): Promise<GitPulse | null> {
  const [index, message] = await Promise.all([
    gitDiffIndex(cwd),
    gitHeadMessage(cwd).catch((error: unknown) => {
      console.error("Failed to read head message for Home git pulse:", error);
      return "";
    }),
  ]);
  return gitPulse(index, message);
}

/** Selected project's git state; refreshed when the window regains focus. */
export function useGitPulse(cwd: string, enabled = true): GitPulseState {
  const [state, setState] = useState<GitPulseState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" });
      return;
    }
    if (!cwd) {
      setState({ status: "unavailable" });
      return;
    }

    let cancelled = false;
    const load = (): void => {
      readGitPulse(cwd)
        .then((pulse) => {
          if (cancelled) return;
          setState(
            pulse ? { status: "ready", pulse } : { status: "unavailable" },
          );
        })
        .catch((error: unknown) => {
          console.error("Failed to load Home git pulse:", { cwd, error });
          if (!cancelled) setState({ status: "unavailable" });
        });
    };

    setState({ status: "loading" });
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [cwd, enabled]);

  return state;
}
