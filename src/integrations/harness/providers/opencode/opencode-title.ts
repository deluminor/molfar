import {
  buildThreadTitlePrompt,
  parseGeneratedSessionTitle,
  type GeneratedSessionTitle,
} from "@/features/sessions/model/session-title";
import { runOpenCodeTextPrompt } from "./opencode-text";

const TITLE_TIMEOUT_MS = 45_000;

export async function generateOpenCodeSessionTitle(input: {
  sessionId: string;
  cwd: string;
  message: string;
}): Promise<GeneratedSessionTitle | null> {
  try {
    const output = await runOpenCodeTextPrompt({
      cwd: input.cwd,
      prompt: buildThreadTitlePrompt(input.message),
      timeoutMs: TITLE_TIMEOUT_MS,
    });
    return parseGeneratedSessionTitle(output, input.message);
  } catch (error) {
    console.debug("[vatra] session title", error);
    return null;
  }
}
