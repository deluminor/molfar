// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  OPEN_CONNECTIONS_EVENT,
  OPEN_REMOTE_PROJECT_EVENT,
} from "@/features/connections/model/connections";
import { useSettingsOpenEvents } from "./use-settings-open-events";

describe("useSettingsOpenEvents", () => {
  it("opens the asked Settings section or dialog until unmounted", () => {
    const openSettings = vi.fn();
    const openRemoteProjectDialog = vi.fn();
    function Probe() {
      useSettingsOpenEvents(openSettings, openRemoteProjectDialog);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));

    window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT));
    window.dispatchEvent(new Event("molfar:open-mcp-settings"));
    window.dispatchEvent(new Event(OPEN_REMOTE_PROJECT_EVENT));
    expect(openSettings.mock.calls).toEqual([["connections"], ["mcp"]]);
    expect(openRemoteProjectDialog).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT));
    expect(openSettings).toHaveBeenCalledTimes(2);
  });
});
