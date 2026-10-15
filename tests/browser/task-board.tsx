import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { TASK_BOARD_CHANGED } from "../../src/features/task-board/constants/limits";
import type { TaskBoardRuntime } from "../../src/features/task-board/hooks/use-task-board-engine";
import { runAction } from "../../src/features/task-board/services/actions";
import { createCard } from "../../src/features/task-board/services/card-create";
import { createFakePorts } from "../../src/features/task-board/services/testing/fake-ports";
import { BoardView } from "../../src/features/task-board/ui/BoardView";
import "../../src/styles/index.css";

// The real board UI over the in-memory engine ports; only native IPC is faked.
mockWindows("main");
mockIPC(
  (command) => {
    if (command === "plugin:window|is_maximized") return false;
    if (command.startsWith("plugin:event|")) return 0;
    throw new Error(`Unexpected command: ${command}`);
  },
  { shouldMockEvents: true },
);
// Project logos resolve asset URLs; the IPC mock does not provide that helper.
Object.assign((window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__, {
  convertFileSrc: (path: string) => path,
});

const fake = createFakePorts();
const changed = () => emit(TASK_BOARD_CHANGED);
const runtime: TaskBoardRuntime = {
  ports: fake.ports,
  create: async (input) => {
    const card = await createCard(fake.ports, input);
    await changed();
    return card;
  },
  act: async (cardId, action) => {
    const card = await runAction(fake.ports, cardId, action);
    await changed();
    return card;
  },
  needsInput: () => false,
};

async function seed() {
  const input = { projectCwd: "/code/app", description: "Build it", acceptanceCriteria: "", baseRef: null };
  const backlog = await createCard(fake.ports, { ...input, title: "Backlog card" });
  const gate = await createCard(fake.ports, { ...input, title: "Plan card" });
  const plan = fake.board.cards.get(gate.id);
  if (plan) fake.board.cards.set(gate.id, { ...plan, columnId: "plan_approval" });
  Object.assign(window, {
    ids: { backlog: backlog.id, gate: gate.id },
    column: (id: string) => fake.board.cards.get(id)?.columnId,
  });
}

void seed().then(() => {
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(
    <div style={{ display: "flex", height: "100vh" }}>
      <BoardView
        runtime={runtime}
        projects={["/code/app"]}
        besideRail
        compactRail={false}
        onClose={() => undefined}
        onToggleSidebar={() => undefined}
        onOpenSession={() => undefined}
      />
    </div>,
  );
});
