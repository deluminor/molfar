import { describe, expect, it } from "vitest";
import { INITIAL_FAMILIARS_STATE, shownFamiliarSession } from "./familiars-slice";

describe("shownFamiliarSession", () => {
  const open = {
    ...INITIAL_FAMILIARS_STATE,
    familiarViewId: "familiar",
    familiarShownSession: "launched",
  };

  it("shows the launched session while the Familiar and its overview are open", () => {
    expect(shownFamiliarSession(open)).toBe("launched");
  });

  it("hides it when the overview is closed", () => {
    expect(shownFamiliarSession({ ...open, familiarOverviewOpen: false })).toBeUndefined();
  });

  it("hides it when no Familiar is in view", () => {
    expect(shownFamiliarSession({ ...open, familiarViewId: null })).toBeUndefined();
  });
});
