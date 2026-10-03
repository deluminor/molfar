import { ensureClaudeRegistered } from "../providers/claude/claude-adapter";
import { ensureCodexRegistered } from "../providers/codex/codex-adapter";
import { ensureCursorRegistered } from "../providers/cursor/cursor-adapter";
import { ensureFxRegistered } from "../providers/fx/fx-adapter";
import { ensureGrokRegistered } from "../providers/grok/grok-adapter";
import { ensureHermesRegistered } from "../providers/hermes/hermes-adapter";
import { ensureOpenCodeRegistered } from "../providers/opencode/opencode-adapter";
import { ensureOmpRegistered } from "../providers/omp/omp-adapter";
import { ensurePiRegistered } from "../providers/pi/pi-adapter";
import { ensureAntigravityRegistered } from "../providers/antigravity/antigravity-adapter";

/** Register all known live harness adapters. Idempotent. */
export function registerBuiltinHarnesses(): void {
  ensureClaudeRegistered();
  ensureCursorRegistered();
  ensureCodexRegistered();
  ensureGrokRegistered();
  ensureOpenCodeRegistered();
  ensurePiRegistered();
  ensureOmpRegistered();
  ensureFxRegistered();
  ensureHermesRegistered();
  ensureAntigravityRegistered();
}
