import { UsageLimitCard } from "@/features/sessions/UsageLimitCard";
import {
  Redirect,
  router,
  Stack,
  useIsFocused,
  useLocalSearchParams,
} from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text } from "react-native";
import { ConnectionNotice } from "@/features/connection/ConnectionNotice";
import { hasNativeTranscript } from "@/features/connection/nativeLink";

import { PixelMascot } from "@/features/mascots/PixelMascot";
import { useFamiliarModel } from "@/features/models/use-familiar-model";
import { useDrawerActions, useDrawerSwipe } from "@/ui/ScenePager";
import { Timed } from "@/ui/Timed";
import { useConnection, useFamiliarTools } from "@/features/connection/ConnectionProvider";
import { rememberPlace } from "@/features/workspace/last-place";
import { markFamiliarSeen, markFamiliarUnread } from "@/features/workspace/familiar-seen";
import { Composer } from "@/features/sessions/Composer";
import { FamiliarChoose, FamiliarMessageActions } from "@/features/sessions/FamiliarCards";
import { FamiliarMenu } from "@/features/sessions/FamiliarMenu";
import { useFamiliarAccent } from "../../features/workspace/familiar-accent";
import { AccentOverride, ACCENTS, mix, themedStyles, useAccent, useScheme } from "@/ui/theme";
import { LiquidView } from "@/ui/LiquidView";
import { useNativeHeaderHeight } from "@/ui/useNativeHeaderHeight";
import type { Familiar } from "@/features/workspace/types";
import { QuestionCard } from "@/features/sessions/QuestionCard";
import { EmptySession } from "@/features/sessions/EmptySession";
import {
  HEADER_HEIGHT,
  SessionContent,
  SessionFrame,
  SessionScreen,
} from "@/features/sessions/SessionScreen";
import { useFamiliarOnlyLayout } from "../../features/settings/familiar-only";
import { Transcript } from "@/features/sessions/Transcript";
import { NativeTranscript } from "@/features/sessions/NativeTranscript";
import type { TranscriptAgent } from "@/features/sessions/TranscriptTurn";
import {
  familiarConversationId,
  useConversation,
  useConversationTurns,
  useWorkspace,
} from "@/features/workspace/WorkspaceProvider";

// A familiar has one long-lived conversation, so its screen is that conversation.
// Familiars only, it is pushed over the list as a session is over its project:
// under the stack's native header, with back on the left and its ⋯ on the
// right as native items, and a frame of its own for its composer, so the
// whole screen slides in and out with the push.
export default function FamiliarRoute() {
  const [familiarOnly] = useFamiliarOnlyLayout();
  return familiarOnly ? <PushedFamiliar /> : <FamiliarScreen familiarOnly={false} />;
}

function PushedFamiliar() {
  const headerHeight = useNativeHeaderHeight();
  return (
    <SessionFrame nativeHeaderHeight={headerHeight}>
      <FamiliarScreen familiarOnly />
    </SessionFrame>
  );
}

function FamiliarScreen({ familiarOnly }: { familiarOnly: boolean }) {
  const { familiarId } = useLocalSearchParams<{ familiarId: string }>();
  const { familiars, sendMessage, stop } = useWorkspace();
  useDrawerSwipe(!familiarOnly);
  const familiar = familiars.find((m) => m.id === familiarId);
  const conversationId = familiar ? familiarConversationId(familiar.id) : null;
  const conversation = useConversation(conversationId);
  // Where the app opens next time.
  const { command, refresh } = useConnection();
  // The older desktop app has no profile, reset or delete for a Familiar.
  const tools = useFamiliarTools();
  const desktop = useConnection().pairing?.desktop.fingerprint;
  const placeId = familiar?.id;
  useEffect(() => {
    if (placeId) rememberPlace(desktop, { kind: "familiar", id: placeId });
  }, [desktop, placeId]);
  // Its replies are seen as they arrive while its chat is in front, unless
  // it was just marked unread: that holds until the chat is left.
  const focused = useIsFocused();
  const keptUnread = useRef(false);
  useEffect(() => {
    if (!focused) keptUnread.current = false;
    else if (familiar && !keptUnread.current) markFamiliarSeen(desktop, familiar);
  }, [focused, desktop, familiar]);
  // A Familiar's message being replied to, quoted over the next one sent.
  const [reply, setReply] = useState<string | null>(null);
  const drawer = useDrawerActions();
  const messageActions = useMemo(
    () => ({
      reply: setReply,
      // As Messages: the chat reads as new again, and the list comes up.
      markUnread: () => {
        if (!familiar) return;
        keptUnread.current = true;
        markFamiliarUnread(desktop, familiar);
        // Familiars only, the list is the one back.
        if (familiarOnly) router.back();
        else drawer.open();
      },
    }),
    [desktop, familiar, drawer, familiarOnly],
  );
  // Stable, so the memoized turns keep their rows across polls.
  const name = familiar?.name ?? "";
  const mascot = familiar?.mascot ?? "";
  const color = familiar?.color ?? "";
  const agent = useMemo(() => ({ name, mascot, color }), [name, mascot, color]);
  const { model, harness, effort } = useFamiliarModel(familiar);
  // The colour picked for this Familiar's chat, over the app's accent.
  const familiarAccent = useFamiliarAccent(familiar?.id);
  const scheme = useScheme();
  // Familiars only, a chat with no colour picked, here or for the app, is drawn
  // in the Familiar's own: as is in the dark, deepened in the light to hold its
  // contrast on the pale background.
  const appAccent = useAccent();
  const ownAccent =
    familiarOnly && appAccent === "theme" && /^#[0-9a-f]{6}$/i.test(color)
      ? scheme === "light"
        ? mix(color, "#000000", 0.22)
        : color
      : null;
  const chatAccent = familiarAccent === "theme" ? ownAccent : ACCENTS[familiarAccent][scheme];
  const choose = useCallback(
    (text: string) => (conversationId ? sendMessage(conversationId, text) : Promise.resolve()),
    [conversationId, sendMessage],
  );
  // A reset or delete, then the catalog read again: a deleted Familiar's screen
  // leaves for the start once it's gone from there.
  const act = async (run: () => Promise<unknown>) => {
    try {
      await run();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (reason) {
      Alert.alert("Couldn’t do that", reason instanceof Error ? reason.message : String(reason));
    }
  };
  if (!familiar || !conversationId) return <Redirect href="/" />;

  const openDetails = () =>
    router.push({ pathname: "/familiar-profile/[familiarId]", params: { familiarId: familiar.id } });
  // Both clear what can't come back, so each asks first, as the desktop does.
  const confirmReset = () =>
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
    );
  const confirmDelete = () =>
    Alert.alert(
      `Delete ${familiar.name}?`,
      "Its scheduled habits stop. Sessions and notes it created stay saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void act(() => command("familiar.delete", { familiarId: familiar.id })),
        },
      ],
    );
  const transcript = (
    <AccentOverride value={chatAccent}>
      <FamiliarChoose value={choose}>
        <FamiliarMessageActions value={messageActions}>
          {hasNativeTranscript
            ? <NativeTranscript key={familiar.id} conversationId={conversationId} agent={agent} />
            : <FamiliarTranscript key={familiar.id} conversationId={conversationId} agent={agent} />}
        </FamiliarMessageActions>
      </FamiliarChoose>
    </AccentOverride>
  );

  return (
    <Timed id="familiar screen">
    <SessionScreen
      pill={{
        icon: <PixelMascot name={familiar.mascot} color={familiar.color} status={headerStatus(familiar)} size={28} />,
        label: familiar.name,
        // Its profile: the desktop's details, and its look to edit.
        onPress: tools
          ? () => router.push({ pathname: "/familiar-profile/[familiarId]", params: { familiarId: familiar.id } })
          : undefined,
      }}
      // Without them, settings on the right, as on a project.
      action={tools ? undefined : { icon: "settings", label: "Settings", onPress: () => router.push("/settings") }}
      // Its details, a fresh start or deleting it, from ⋯ on the right.
      trailing={
        tools ? (
          <FamiliarMenu onDetails={openDetails} onReset={confirmReset} onDelete={confirmDelete} />
        ) : undefined
      }
      composer={
        <AccentOverride value={chatAccent}>
          {conversation.question ? (
            <QuestionCard conversationId={conversationId} prompt={conversation.question} />
          ) : null}
          {conversationId && conversation.usageLimit ? (
            <UsageLimitCard key={`usage:${conversationId}`} conversationId={conversationId} state={conversation.usageLimit} />
          ) : null}
          <Composer
            key={familiar.id}
            // One line: the header names the Familiar, and its model lives in settings.
            active={focused}
            compact
            context=""
            branch=""
            model={model}
            effort={effort}
            harness={harness}
            onModelPress={() =>
              router.push({
                pathname: "/models",
                params: { projectId: "", sessionId: conversationId },
              })
            }
            busy={conversation.busy}
            onStop={() => stop(conversationId)}
            reply={reply}
            onClearReply={() => setReply(null)}
            onSend={(text, attachments) => {
              // A reply opens with the message it answers, quoted on one line,
              // so the Familiar reads it in context and the chat shows it above.
              const quoted = reply?.replace(/\s+/g, " ").trim();
              setReply(null);
              return sendMessage(
                conversationId,
                quoted ? `> ${quoted.length > 280 ? quoted.slice(0, 279) + "…" : quoted}\n\n${text}` : text,
                attachments,
              );
            }}
          />
        </AccentOverride>
      }
    >
      <ConnectionNotice error={conversation.error} />
      {familiarOnly ? (
        <>
          {/* The stack's native header: back from the stack, the Familiar's
              pill for a title, and its ⋯ as a native menu. */}
          <Stack.Screen
            options={{
              headerTitle: () => (
                <FamiliarTitle familiar={familiar} onPress={tools ? openDetails : undefined} />
              ),
            }}
          />
          <Stack.Toolbar placement="right">
            {tools ? (
              <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More">
                <Stack.Toolbar.MenuAction icon="info.circle" onPress={openDetails}>
                  View details
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction icon="arrow.counterclockwise" onPress={confirmReset}>
                  Reset conversation
                </Stack.Toolbar.MenuAction>
                <Stack.Toolbar.MenuAction icon="trash" destructive onPress={confirmDelete}>
                  Delete Familiar
                </Stack.Toolbar.MenuAction>
              </Stack.Toolbar.Menu>
            ) : (
              <Stack.Toolbar.Button
                icon="gearshape"
                accessibilityLabel="Settings"
                onPress={() => router.push("/settings")}
              />
            )}
          </Stack.Toolbar>
          <SessionContent>{transcript}</SessionContent>
        </>
      ) : (
        // A suggested reply it offers is sent as the user's message.
        transcript
      )}
    </SessionScreen>
    </Timed>
  );
}

/** A Familiar's header mascot holds still while it works: its chat shows that,
 *  beside the "Thinking…" line. The bulb still asks for you. */
function headerStatus(familiar: Familiar) {
  return familiar.status === "working" ? "idle" : familiar.status;
}

/** A pushed Familiar's title: its mascot and name in a glass pill, which opens
 *  its profile. */
function FamiliarTitle({ familiar, onPress }: { familiar: Familiar; onPress?: () => void }) {
  const styles = useTitleStyles();
  return (
    <LiquidView
      borderRadius={HEADER_HEIGHT / 2}
      style={styles.frame}
      innerStyle={styles.pill}
      onPress={onPress}
      accessibilityLabel={onPress ? familiar.name : undefined}
      pressedScale={onPress ? 1.04 : undefined}
    >
      <PixelMascot name={familiar.mascot} color={familiar.color} status={headerStatus(familiar)} size={28} />
      <Text style={styles.label} numberOfLines={1}>
        {familiar.name}
      </Text>
    </LiquidView>
  );
}

const useTitleStyles = themedStyles((colors) => ({
  // Kept narrow so a long name truncates rather than spanning the header.
  frame: {
    maxWidth: 220,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: HEADER_HEIGHT,
    paddingLeft: 12,
    paddingRight: 18,
  },
  label: {
    flexShrink: 1,
    color: colors.content,
    fontSize: 17,
    fontWeight: "600",
  },
}));

/** The familiar's turns, read here so a streaming reply re-renders only the transcript. */
function FamiliarTranscript({
  conversationId,
  agent,
}: {
  conversationId: string;
  agent: TranscriptAgent;
}) {
  const { turns, hasOlder, loadOlder } = useConversationTurns(conversationId);
  return turns.length > 0 ? (
    <Transcript turns={turns} agent={agent} hasOlder={hasOlder} loadOlder={loadOlder} />
  ) : (
    <EmptySession familiar={agent} />
  );
}
