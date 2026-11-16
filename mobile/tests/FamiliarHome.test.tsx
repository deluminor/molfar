import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useFamiliarHome } from "@/features/workspace/familiar-home/use-familiar-home";
import type { Familiar } from "@/features/workspace/types";

const state = vi.hoisted(() => ({
  roster: [] as Familiar[],
  select: vi.fn(async () => {}),
  command: vi.fn(async () => {}),
  navigation: { addListener: () => () => {} },
}));
vi.mock("expo-haptics", () => ({ notificationAsync: async () => {}, NotificationFeedbackType: { Success: "success" } }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, useIsFocused: () => true, useNavigation: () => state.navigation }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() }, TextInput: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/features/connection/ConnectionProvider", () => ({
  useConnection: () => ({ pairing: { desktop: { fingerprint: "desktop" } }, command: state.command, refresh: async () => {}, selection: { familiarIds: ["first"] }, select: state.select }),
  useFamiliarTools: () => true,
}));
vi.mock("@/features/connection/nativeLink", () => ({ hideScrollEdgeEffects: vi.fn() }));
vi.mock("@/features/sessions/SessionScreen", () => ({ useKeyboardLift: () => ({}) }));
vi.mock("@/ui/theme", () => ({ useColors: () => ({}), useScheme: () => "dark" }));
vi.mock("@/features/workspace/familiar-seen", () => ({ markFamiliarSeen: vi.fn(), markFamiliarUnread: vi.fn(), useUnreadFamiliars: () => new Set() }));
vi.mock("@/features/workspace/new-familiar", () => ({ onFamiliarCreated: () => () => {} }));
vi.mock("@/features/workspace/WorkspaceProvider", () => ({ useWorkspace: () => ({ familiars: state.roster }) }));
vi.mock("@/features/workspace/familiar-home/styles", () => ({ useStyles: () => ({}) }));

it("shows a hidden Familiar again when it is reselected after authoritative removal", async () => {
  const familiar: Familiar = { id: "first", name: "First", mascot: "dragon", color: "blue", projectIds: [], unread: 0, status: "idle", lastMessage: "hello", lastActiveAt: 1 };
  state.roster = [familiar];
  let result: ReturnType<typeof useFamiliarHome> | undefined;
  function Host() {
    result = useFamiliarHome();
    return <output>{result.familiars.map((item) => item.id).join(",")}</output>;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Host />));
    expect(container.textContent).toBe("first");
    await act(async () => result?.actions.hide?.(familiar));
    expect(container.textContent).toBe("");
    state.roster = [...state.roster];
    await act(async () => root.render(<Host />));
    expect(container.textContent).toBe("");
    state.roster = [];
    await act(async () => root.render(<Host />));
    state.roster = [familiar];
    await act(async () => root.render(<Host />));
    expect(container.textContent).toBe("first");
  } finally {
    await act(async () => root.unmount());
  }
});
