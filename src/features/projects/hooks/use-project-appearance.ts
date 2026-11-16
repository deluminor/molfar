import { useEffect, useState } from "react";
import { subscribeProjectPathsChanged } from "../model/recents";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
} from "@/features/workspace/model/tab-groups";

function loadAppearance() {
  return {
    groupLabels: loadTabGroupLabels(),
    groupColors: loadTabGroupColors(),
    groupCustomColors: loadTabGroupCustomColors(),
    groupMascots: loadTabGroupMascots(),
  };
}

/** Projects' names, colors and mascots as picked in the project menu. */
export function useProjectAppearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  useEffect(
    () => subscribeProjectPathsChanged(() => setAppearance(loadAppearance())),
    [],
  );
  return appearance;
}
