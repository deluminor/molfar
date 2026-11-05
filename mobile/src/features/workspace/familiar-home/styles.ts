import { StyleSheet } from "react-native";
import { themedStyles } from "@/ui/theme";
import { AVATAR, FOOTER_HEIGHT, PREVIEW_WIDTH, PREVIEW_HEIGHT } from "./constants";

export const useStyles = themedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  preview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  previewCard: {
    flex: 1,
    backgroundColor: colors.background,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  previewName: {
    flex: 1,
    color: colors.content,
    fontSize: 17,
    fontWeight: "600",
  },
  previewBody: {
    flex: 1,
    padding: 16,
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  bubbleText: {
    color: colors.content,
    fontSize: 16,
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 70,
    // The mascot's left edge level with the MOLFAR mark's: iOS insets
    // the bar's items 16pt, and the mark sits 3pt into its 44pt box.
    paddingLeft: 19,
    paddingRight: 20,
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLabel: {
    flex: 1,
    color: colors.content,
    fontSize: 16,
    fontWeight: "500",
  },
  rowTime: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  rowTimeUnread: {
    color: colors.accent,
  },
  rowDetail: {
    color: colors.muted,
    fontSize: 14,
  },
  rowFill: {
    flex: 1,
  },
  rowNeedsYou: {
    color: colors.caution,
  },
  unread: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  empty: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
  },
  // The MOLFAR mark, centred over the rows' mascots below it.
  markBox: {
    width: AVATAR,
    height: AVATAR,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 38,
    height: 38,
  },
  emptyLink: {
    color: colors.accent,
    fontSize: 15,
  },
  foot: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchFrame: {
    flex: 1,
  },
  search: {
    height: FOOTER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    height: FOOTER_HEIGHT,
    color: colors.content,
    fontSize: 17,
  },
}));
