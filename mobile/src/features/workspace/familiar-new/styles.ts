import { radii, themedStyles } from "@/ui/theme";
import { TILE_GAP, BUTTON_HEIGHT } from "./constants";

export const useStyles = themedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  content: {
    paddingHorizontal: 20,
    gap: 28,
  },
  preview: {
    alignItems: "center",
    paddingTop: 20,
  },
  input: {
    height: 56,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    color: colors.content,
    fontSize: 20,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TILE_GAP,
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 14,
  },
  ring: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  foot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  button: {
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.8,
  },
}));
