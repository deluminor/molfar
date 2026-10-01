import { expect, it } from "vitest";
import { fadeColor } from "./fade-color";

it("applies alpha to computed rgb and rgba colors", () => {
  expect(fadeColor("rgb(10, 20, 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
  expect(fadeColor("rgba(10, 20, 30, 0.9)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
  expect(fadeColor("rgb(10 20 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
});

it("keeps colors it cannot parse", () => {
  expect(fadeColor("oklch(0.5 0.1 200)", 0.2)).toBe("oklch(0.5 0.1 200)");
});
