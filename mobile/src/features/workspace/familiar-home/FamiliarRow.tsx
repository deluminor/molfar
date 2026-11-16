import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { PixelMascot } from "@/features/mascots/PixelMascot";
import { plainText } from "@/features/sessions/markdownParser";
import { Shimmer } from "@/ui/Shimmer";
import { oneLine, when } from "../WorkspaceDrawer";
import type { Familiar } from "../types";
import { MASCOT } from "./constants";
import { useStyles } from "./styles";

export type RowActions = {
  toggleRead: (familiar: Familiar) => void;
  details?: (familiar: Familiar) => void;
  reset?: (familiar: Familiar) => void;
  hide?: (familiar: Familiar) => void;
  remove?: (familiar: Familiar) => void;
};

/** A Familiar as a chat in the list: its mascot, its name and when it was last
 *  active, and under them what it is doing or its last line. A tap opens its
 *  chat; a long press lifts it into iOS's own preview of its latest message,
 *  with a menu of what can be done to it, as Messages does. */
export const FamiliarRow = memo(function FamiliarRow({
  familiar,
  unread,
  shown,
  tools,
  actions,
}: {
  familiar: Familiar;
  /** A reply it sent that the user hasn't seen. */
  unread: boolean;
  /** Whether the list is in front, for the working shimmer. */
  shown: boolean;
  /** Whether the desktop can show its details, reset or delete it. */
  tools: boolean;
  actions: RowActions;
}) {
  const styles = useStyles();
  const detail =
    familiar.status === "working"
      ? "Working…"
      : familiar.status === "needs-you"
        ? "Needs you"
        : oneLine(familiar.lastMessage) || "No messages yet";
  return (
    <Link
      href={{ pathname: "/familiar/[familiarId]", params: { familiarId: familiar.id } }}
      asChild
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      <Link.Trigger>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${familiar.name}, ${detail}`}
          style={styles.row}
        >
          <PixelMascot name={familiar.mascot} color={familiar.color} status={familiar.status} size={MASCOT} centered />
          <View style={styles.rowText}>
            <View style={styles.rowLine}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {familiar.name}
              </Text>
              {familiar.lastActiveAt ? (
                <Text style={[styles.rowTime, unread && styles.rowTimeUnread]}>
                  {when(familiar.lastActiveAt)}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowLine}>
              {familiar.status === "working" && shown ? (
                <Shimmer style={[styles.rowDetail, styles.rowFill]}>{detail}</Shimmer>
              ) : (
                <Text
                  style={[
                    styles.rowDetail,
                    styles.rowFill,
                    familiar.status === "needs-you" && styles.rowNeedsYou,
                  ]}
                  numberOfLines={1}
                >
                  {detail}
                </Text>
              )}
              {unread ? <View style={styles.unread} /> : null}
            </View>
          </View>
        </Pressable>
      </Link.Trigger>
      <Link.Preview style={styles.preview}>
        <FamiliarPreview familiar={familiar} />
      </Link.Preview>
      <Link.Menu>
        <Link.MenuAction
          icon={unread ? "message" : "message.badge"}
          onPress={() => actions.toggleRead(familiar)}
        >
          {unread ? "Mark as Read" : "Mark as Unread"}
        </Link.MenuAction>
        {tools ? (
          <Link.MenuAction icon="info.circle" onPress={() => actions.details?.(familiar)}>
            View Details
          </Link.MenuAction>
        ) : null}
        {tools ? (
          <Link.MenuAction icon="arrow.counterclockwise" onPress={() => actions.reset?.(familiar)}>
            Reset Conversation
          </Link.MenuAction>
        ) : null}
        <Link.MenuAction icon="eye.slash" onPress={() => actions.hide?.(familiar)}>
          Hide
        </Link.MenuAction>
        {tools ? (
          <Link.MenuAction icon="trash" destructive onPress={() => actions.remove?.(familiar)}>
            Delete Familiar
          </Link.MenuAction>
        ) : null}
      </Link.Menu>
    </Link>
  );
});

/** What a long press lifts: the Familiar's name over its latest message, in a
 *  bubble as its chat shows it. */
function FamiliarPreview({ familiar }: { familiar: Familiar }) {
  const styles = useStyles();
  const text =
    familiar.status === "working"
      ? "Working…"
      : plainText(familiar.lastMessage.slice(0, 1200)).trim() || "No messages yet";
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <PixelMascot name={familiar.mascot} color={familiar.color} status={familiar.status} size={28} centered />
        <Text style={styles.previewName} numberOfLines={1}>
          {familiar.name}
        </Text>
      </View>
      <View style={styles.previewBody}>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText} numberOfLines={8}>
            {text}
          </Text>
        </View>
      </View>
    </View>
  );
}
