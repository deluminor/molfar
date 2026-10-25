import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ConnectionNotice } from "@/features/connection/ConnectionNotice";
import { hasNativeTranscript } from "@/features/connection/nativeLink";

import { PixelMascot } from "@/features/mascots/PixelMascot";
import { Composer } from "@/features/sessions/Composer";
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
  const familiar = familiars.find((m) => m.id === familiarId);
  const conversationId = familiar ? familiarConversationId(familiar.id) : null;
  const conversation = useConversation(conversationId);
  // Stable, so the memoized turns keep their rows across polls.
  const name = familiar?.name ?? "";
  const mascot = familiar?.mascot ?? "";
  const color = familiar?.color ?? "";
  const agent = useMemo(() => ({ name, mascot, color }), [name, mascot, color]);
  if (!familiar || !conversationId) return <Redirect href="/" />;

  return (
    <SessionScreen
      pill={{
        icon: <PixelMascot name={familiar.mascot} color={familiar.color} status={familiar.status} size={28} />,
        label: familiar.name,
      }}
      composer={
        <Composer
          key={familiar.id}
          context={familiar.name}
          branch=""
          model={familiar.model ?? ""}
          harness={familiar.harness}
          busy={conversation.busy}
          onStop={() => stop(conversationId)}
          onSend={(text, attachments) => sendMessage(conversationId, text, attachments)}
        />
      }
    >
      <ConnectionNotice error={conversation.error} />
      {hasNativeTranscript
        ? <NativeTranscript key={familiar.id} conversationId={conversationId} agent={agent} />
        : <FamiliarTranscript key={familiar.id} conversationId={conversationId} agent={agent} />}
    </SessionScreen>
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
    <EmptySession />
  );
}
