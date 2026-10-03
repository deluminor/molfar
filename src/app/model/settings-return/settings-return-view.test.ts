import { describe, expect, it } from "vitest";
import {
  captureSettingsReturnView,
  restoreSettingsReturnView,
} from "./settings-return-view";
import { RAIL_SURFACES_DEFAULT } from "@/features/settings/model/project-rail";
import type { SettingsReturnView } from "./types";

function workspace(): SettingsReturnView {
  return {
    search: false,
    inbox: false,
    notes: false,
    automations: false,
    localSurface: null,
  };
}

describe("settings return navigation", () => {
  it.each(["home", "usage", "knowledge"] as const)(
    "restores %s rather than opening Automations",
    (localSurface) => {
      const original = { ...workspace(), localSurface };
      const snapshot = captureSettingsReturnView(workspace(), original, false);
      const reopenedSnapshot = captureSettingsReturnView(
        snapshot,
        workspace(),
        true,
      );
      const restored = restoreSettingsReturnView(
        reopenedSnapshot,
        true,
        RAIL_SURFACES_DEFAULT,
      );

      expect(restored.localSurface).toBe(localSurface);
      expect(restored.automations).toBe(false);
    },
  );

  it("returns to Automations when opened from its actual surface", () => {
    const snapshot = captureSettingsReturnView(
      workspace(),
      { ...workspace(), automations: true },
      false,
    );

    expect(restoreSettingsReturnView(snapshot, true, RAIL_SURFACES_DEFAULT)).toEqual({
      ...workspace(),
      automations: true,
    });
  });

  it("does not reopen Notes after the feature was disabled in Settings", () => {
    const snapshot = captureSettingsReturnView(
      workspace(),
      { ...workspace(), notes: true },
      false,
    );

    expect(restoreSettingsReturnView(snapshot, false, RAIL_SURFACES_DEFAULT)).toEqual(workspace());
  });

  it("does not reopen a rail surface that was hidden in Settings", () => {
    const snapshot = captureSettingsReturnView(
      workspace(),
      { ...workspace(), localSurface: "usage" },
      false,
    );

    expect(
      restoreSettingsReturnView(snapshot, true, {
        ...RAIL_SURFACES_DEFAULT,
        usage: false,
      }),
    ).toEqual(workspace());
  });

  it("captures a new destination on the next visit to Settings", () => {
    const home = captureSettingsReturnView(
      workspace(),
      { ...workspace(), localSurface: "home" },
      false,
    );
    const search = captureSettingsReturnView(
      home,
      { ...workspace(), search: true },
      false,
    );

    expect(restoreSettingsReturnView(search, true, RAIL_SURFACES_DEFAULT)).toEqual({
      ...workspace(),
      search: true,
    });
  });
});
