import { Redirect, router, useIsFocused, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
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
import { useFamiliarAccent } from "@/features/workspace/familiar-accent";
import { AccentOverride, ACCENTS, useScheme } from "@/ui/theme";
import { QuestionCard } from "@/features/sessions/QuestionCard";
import { EmptySession } from "@/features/sessions/EmptySession";
import { SessionScreen } from "@/features/sessions/SessionScreen";
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
export default function FamiliarScreen() {
  const { familiarId } = useLocalSearchParams<{ familiarId: string }>();
  const { familiars, sendMessage, stop } = useWorkspace();
  useDrawerSwipe();
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
        drawer.open();
      },
    }),
    [desktop, familiar, drawer],
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
  const chatAccent = familiarAccent === "theme" ? null : ACCENTS[familiarAccent][scheme];
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

  return (
    <Timed id="familiar screen">
    <SessionScreen
      pill={{
        icon: <PixelMascot name={familiar.mascot} color={familiar.color} status={familiar.status} size={28} />,
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
        tools ? <FamiliarMenu
          onDetails={() =>
            router.push({ pathname: "/familiar-profile/[familiarId]", params: { familiarId: familiar.id } })
          }
          // Both clear what can't come back, so each asks first, as the desktop does.
          onReset={() =>
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
          }
          onDelete={() =>
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
            )
          }
        /> : undefined
      }
      composer={
        <AccentOverride value={chatAccent}>
          {conversation.question ? (
            <QuestionCard conversationId={conversationId} prompt={conversation.question} />
          ) : null}
          <Composer
            key={familiar.id}
            // One line: the header names the Familiar, and its model lives in settings.
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
      {/* A suggested reply it offers is sent as the user's message. */}
      <AccentOverride value={chatAccent}>
        <FamiliarChoose value={choose}>
          <FamiliarMessageActions value={messageActions}>
            {hasNativeTranscript
              ? <NativeTranscript key={familiar.id} conversationId={conversationId} agent={agent} />
              : <FamiliarTranscript key={familiar.id} conversationId={conversationId} agent={agent} />}
          </FamiliarMessageActions>
        </FamiliarChoose>
      </AccentOverride>
    </SessionScreen>
    </Timed>
  );
}

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
