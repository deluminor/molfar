import { useCallback, type ReactNode } from "react";
import { RailAction } from "../../../app/shell/RailAction";
import { Gauge, Home } from "../../../shared/ui/icons";
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
};

export function LocalSurfaceRailActions({
  active,
  visible,
  onOpen,
}: Props): ReactNode {
  const openHome = useCallback(() => onOpen("home"), [onOpen]);
  const openUsage = useCallback(() => onOpen("usage"), [onOpen]);

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
    </>
  );
}
