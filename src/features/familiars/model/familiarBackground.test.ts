// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { CHAT_BACKGROUND_OPACITY_DEFAULT } from "../../settings/model/appearance";
import { saveProjectChatBackgroundSettings } from "../../projects/model/projectChatBackground";
import { familiarBackgroundKey, familiarChatBackground } from "./familiarBackground";

afterEach(() => localStorage.clear());

it("always shows a Familiar's background as a dimmed Haze", () => {
  expect(familiarChatBackground("a")).toBeNull();
  saveProjectChatBackgroundSettings(familiarBackgroundKey("a"), {
    path: "/bg/familiar.png",
    emptyOpacity: 0.6,
    sessionOpacity: 0.5,
    scope: "empty",
    effect: "dither",
  });
  expect(familiarChatBackground("a")).toEqual({
    path: "/bg/familiar.png",
    emptyOpacity: CHAT_BACKGROUND_OPACITY_DEFAULT,
    sessionOpacity: CHAT_BACKGROUND_OPACITY_DEFAULT,
    scope: "all",
    effect: "gradient-blur",
  });
});
