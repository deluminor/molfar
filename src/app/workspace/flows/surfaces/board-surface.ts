import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import { requestBoardFocus } from "@/features/task-board/model/board-focus";

/** Opens the Task Board with a card focused. */
export function openBoardCard(openLocalSurface: (surface: LocalSurfaceId) => void, cardId: string): void {
  requestBoardFocus(cardId);
  openLocalSurface("board");
}
