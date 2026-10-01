import { useCallback, type ReactNode } from "react";
import { RailAction } from "../../../app/shell/RailAction";
import { Gauge, Home } from "../../../shared/ui/icons";

/** Fork-only workspace surfaces opened from the project rail. */
export type LocalSurfaceId = "home" | "usage" | "knowledge";

type Props = {
  active: LocalSurfaceId | null;
  onOpen: (id: LocalSurfaceId) => void;
};

export function LocalSurfaceRailActions({ active, onOpen }: Props): ReactNode {
  const openHome = useCallback(() => onOpen("home"), [onOpen]);
  const openUsage = useCallback(() => onOpen("usage"), [onOpen]);
  return (
    <>
      <RailAction
        label="Home"
        icon={Home}
        onClick={openHome}
        active={active === "home"}
      />
      <RailAction
        label="Usage"
        icon={Gauge}
        onClick={openUsage}
        active={active === "usage"}
      />
    </>
  );
}
