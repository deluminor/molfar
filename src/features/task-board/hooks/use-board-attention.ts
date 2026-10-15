import { useEffect, useState } from "react";
import { onTaskBoardChanged } from "../api/task-board-client";
import { boardAttentionCount } from "../model/attention";
import type { BoardStorePort } from "../services/ports";

/** How many cards wait on the user, kept current with every board change. */
export function useBoardAttention(store: BoardStorePort): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      store
        .listCards(null, false)
        .then((cards) => alive && setCount(boardAttentionCount(cards)))
        .catch((error: unknown) => console.error("Task board: attention count failed", error));
    };
    refresh();
    const unlisten = onTaskBoardChanged(refresh);
    return () => {
      alive = false;
      unlisten();
    };
  }, [store]);

  return count;
}
