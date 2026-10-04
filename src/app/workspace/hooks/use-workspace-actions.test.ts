import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorkspaceStore } from "../store/create-workspace-store";
import { testWorkspaceState } from "../store/test-state";

type BiomeHook = { name: string; stableResult: string[] };

function stableActionNames(): string[] {
  const config = JSON.parse(readFileSync("biome.json", "utf8"));
  const hooks: BiomeHook[] =
    config.linter.rules.correctness.useExhaustiveDependencies.options.hooks;
  return (
    hooks.find((hook) => hook.name === "useWorkspaceActions")?.stableResult ??
    []
  );
}

describe("useWorkspaceActions", () => {
  it("is declared stable in biome.json for exactly the store's actions", () => {
    const state = createWorkspaceStore(
      testWorkspaceState(),
    ).getState() as unknown as Record<string, unknown>;
    const actions = Object.keys(state).filter(
      (key) => typeof state[key] === "function",
    );

    expect(stableActionNames().sort()).toEqual(actions.sort());
  });
});
