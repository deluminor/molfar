import * as Haptics from "expo-haptics";
import { router, useIsFocused, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnection, useFamiliarTools } from "@/features/connection/ConnectionProvider";
import { hideScrollEdgeEffects } from "@/features/connection/nativeLink";
import { useKeyboardLift } from "@/features/sessions/SessionScreen";
import { useColors, useScheme } from "@/ui/theme";
import { markFamiliarSeen, markFamiliarUnread, useUnreadFamiliars } from "../familiar-seen";
import { onFamiliarCreated } from "../new-familiar";
import type { Familiar } from "../types";
import { useWorkspace } from "../WorkspaceProvider";
import type { RowActions } from "./FamiliarRow";
import { LIST_ID, FOOTER_HEIGHT } from "./constants";
import { useStyles } from "./styles";

export function useFamiliarHome() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles();
  const { familiars: roster } = useWorkspace();
  const { pairing, command, refresh, selection, select } = useConnection();
  const tools = useFamiliarTools();
  const [query, setQuery] = useState("");
  const [listReady, setListReady] = useState(false);
  useEffect(() => {
    if (!listReady) return;
    hideScrollEdgeEffects(LIST_ID);
    const timer = setTimeout(() => hideScrollEdgeEffects(LIST_ID), 500);
    return () => clearTimeout(timer);
  }, [listReady]);
  const created = useRef<string | null>(null);
  useEffect(
    () =>
      onFamiliarCreated((familiarId) => {
        created.current = familiarId;
      }),
    [],
  );
  const unread = useUnreadFamiliars(pairing?.desktop.fingerprint, roster);
  const focused = useIsFocused();
  const navigation = useNavigation();
  const [coveredByChat, setCovered] = useState(false);
  useEffect(
    () =>
      navigation.addListener("transitionStart" as never, (event: { data?: { closing?: boolean } }) => {
        if (event.data?.closing) setCovered(true);
      }),
    [navigation],
  );
  const covered = coveredByChat && !focused;
  if (coveredByChat && focused) setCovered(false);

  const [hidden, setHidden] = useState(() => ({ roster, ids: new Set<string>() }));
  let gone = hidden.ids;
  if (hidden.roster !== roster) {
    const present = new Set(roster.map((familiar) => familiar.id));
    gone = new Set([...hidden.ids].filter((id) => present.has(id)));
    setHidden({ roster, ids: gone });
  }

  const setGoneId = (id: string, isGone: boolean) =>
    setHidden((previous) => {
      const ids = new Set(previous.ids);
      if (isGone) ids.add(id);
      else ids.delete(id);
      return { ...previous, ids };
    });

  const needle = query.trim().toLowerCase();
  const familiars = useMemo(
    () =>
      [...roster]
        .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
        .filter(
          (familiar) =>
            !gone.has(familiar.id) && (!needle || familiar.name.toLowerCase().includes(needle)),
        ),
    [roster, needle, gone],
  );

  useEffect(() => {
    const familiarId = created.current;
    if (!focused || !familiarId) return;
    created.current = null;
    openFamiliar(familiarId);
  }, [focused]);

  const desktop = pairing?.desktop.fingerprint;
  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (reason) {
      Alert.alert("Couldn’t do that", reason instanceof Error ? reason.message : String(reason));
    }
  };
  const removeNow = (familiar: Familiar, run: () => Promise<unknown>) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGoneId(familiar.id, true);
    run()
      .then(() => refresh())
      .catch((reason: unknown) => {
        setGoneId(familiar.id, false);
        Alert.alert("Couldn’t do that", reason instanceof Error ? reason.message : String(reason));
      });
  };
  const handlers: RowActions = {
    toggleRead: (familiar) =>
      unread.has(familiar.id) ? markFamiliarSeen(desktop, familiar) : markFamiliarUnread(desktop, familiar),
    details: tools
      ? (familiar) => router.push({ pathname: "/familiar-profile/[familiarId]", params: { familiarId: familiar.id } })
      : undefined,
    reset: tools
      ? (familiar) =>
          Alert.alert(
            "Reset conversation?",
            `The chat with ${familiar.name} will be cleared. Its soul, memory and habits stay.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: () => void act(() => command("familiar.reset", { familiarId: familiar.id })),
              },
            ],
          )
      : undefined,
    hide: selection
      ? (familiar) =>
          removeNow(familiar, () =>
            select({ ...selection, familiarIds: selection.familiarIds.filter((id) => id !== familiar.id) }),
          )
      : undefined,
    remove: tools
      ? (familiar) =>
          Alert.alert(
            `Delete ${familiar.name}?`,
            "Its scheduled habits stop. Sessions and notes it created stay saved.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => removeNow(familiar, () => command("familiar.delete", { familiarId: familiar.id })),
              },
            ],
          )
      : undefined,
  };
  const latest = useRef<RowActions | null>(null);
  useEffect(() => {
    latest.current = handlers;
  });
  const [actions] = useState<RowActions>(() => ({
    toggleRead: (familiar) => latest.current?.toggleRead(familiar),
    details: (familiar) => latest.current?.details?.(familiar),
    reset: (familiar) => latest.current?.reset?.(familiar),
    hide: (familiar) => latest.current?.hide?.(familiar),
    remove: (familiar) => latest.current?.remove?.(familiar),
  }));

  const footerBottom = Math.max(insets.bottom, 12);
  const footerTop = footerBottom + FOOTER_HEIGHT + 12;
  const search = useRef<TextInput>(null);
  const lift = useKeyboardLift(footerBottom - 10, search);
  const scheme = useScheme();

  return { styles, colors, listReady, setListReady, footerTop, familiars, unread, focused, tools, actions, needle, covered, footerBottom, lift, search, query, setQuery, scheme };
}

function openFamiliar(id: string): void {
  router.push({ pathname: "/familiar/[familiarId]", params: { familiarId: id } });
}
