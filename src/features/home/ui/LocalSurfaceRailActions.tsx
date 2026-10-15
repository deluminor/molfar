import { useCallback, type ReactNode } from "react";
import { RailAction } from "../../../app/shell/RailAction";
import { Gauge, Home, Kanban } from "../../../shared/ui/icons";
import type {
  RailSurfaceId,
  RailSurfaceVisibility,
} from "../../settings/model/projectRail";

/** Fork-only workspace surfaces opened from the project rail. */
export type LocalSurfaceId = RailSurfaceId;

type Props = {
  active: LocalSurfaceId | null;
  visible: RailSurfaceVisibility;
  onOpen: (id: LocalSurfaceId) => void;
  /** Items waiting on the user per surface, e.g. Task Board cards at a gate. */
  badges?: Partial<Record<LocalSurfaceId, number>>;
};

export function LocalSurfaceRailActions({
  active,
  visible,
  onOpen,
  badges = {},
}: Props): ReactNode {
  const openHome = useCallback(() => onOpen("home"), [onOpen]);
  const openUsage = useCallback(() => onOpen("usage"), [onOpen]);
  const openBoard = useCallback(() => onOpen("board"), [onOpen]);

  return (
    <>
      {visible.home ? (
        <RailAction
          label="Home"
          icon={Home}
          onClick={openHome}
          active={active === "home"}
        />
      ) : null}
      {visible.usage ? (
        <RailAction
          label="Usage"
          icon={Gauge}
          onClick={openUsage}
          active={active === "usage"}
        />
      ) : null}
      {visible.board ? (
        <RailAction
          label="Board"
          ariaLabel={badges.board ? `Board, ${badges.board} waiting on you` : "Board"}
          icon={Kanban}
          onClick={openBoard}
          active={active === "board"}
          badge={badges.board || undefined}
        />
      ) : null}
    </>
  );
}
