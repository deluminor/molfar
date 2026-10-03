import { describe, expect, it } from "vitest";
import { RAIL_SURFACES_DEFAULT } from "../../../features/settings/model/project-rail";
import { visibleLocalSurface } from "./visible-local-surface";

describe("visibleLocalSurface", () => {
  it("keeps no surface closed", () => {
    expect(visibleLocalSurface(null, RAIL_SURFACES_DEFAULT)).toBeNull();
  });

  it.each(["home", "usage", "knowledge"] as const)(
    "keeps %s open while its rail entry is visible",
    (surface) => {
      const visibility = { ...RAIL_SURFACES_DEFAULT, [surface]: true };

      expect(visibleLocalSurface(surface, visibility)).toBe(surface);
    },
  );

  it.each(["home", "usage", "knowledge"] as const)(
    "closes %s once its rail entry is hidden",
    (surface) => {
      const visibility = { ...RAIL_SURFACES_DEFAULT, [surface]: false };

      expect(visibleLocalSurface(surface, visibility)).toBeNull();
    },
  );
});
