# Task Board

A global Kanban board whose agent stages each run in a fresh, hidden session. Spec and plan live in
`docs/specs/task-board/` (local, git-ignored).

## Split of responsibilities

| Layer | Location | Owns |
| --- | --- | --- |
| Persistence | `src-tauri/src/task_board/` | `task_board_cards`, `task_board_stage_runs`, `task_board_artifacts`, `task_board_settings` in the session-store DB; artifact files under `<appData>/task-board/<cardId>/<kind>-<version>.md`; compare-and-swap on `updatedAt`; atomic queue claim; `molfar:task-board-changed` events |
| Domain (pure) | `src/features/task-board/model/` | State machine (`transitions.ts`), prompt templates, artifact markers and parsers, checkout checks, card status |
| Engine | `src/features/task-board/services/` | Claim → prepare (worktree, snapshot, prompt) → launch → settle (parse, verify checkout, persist, advance); reconcile; delivery and rejection; owner actions |
| App seam | `src/app/model/task-board-session-port.ts`, `App.tsx` | Hidden session launch through the quick-launch path; engine mounted in the `main` window only |
| UI | `src/features/task-board/ui/` | Board local surface, columns with model chips, card drawer with artifacts, questions, review checklist, diff and gate actions |
| Companion | `src/features/companion/model/companion-board*.ts` | `board.*` RPCs over the same owner actions |

## Stage contract

- The engine inlines input artifacts into the prompt; the stage returns its artifacts between
  `<<<MOLFAR:kind>>>` / `<<<END:kind>>>` markers in its final message. The session port captures the full
  turn text at settlement (the settlement outcome alone is capped at 20 000 characters).
- Grill and Code review run in `auto` mode; HEAD and `git status --porcelain` must match before and after.
- Implement and Rework must finish with a clean tree and at least one new commit.
- A run is recorded before each side effect (`accepted → session_prepared → turn_submitted → settled`);
  reconcile turns runs whose session vanished into `interrupted`.

## State machine

`backlog → grill → plan_approval → implement → code_review → final_review → (rework → code_review)* → done`.
Plan approval and final review are manual gates; `implement`/`rework` success advances to `code_review`
automatically. Drag-and-drop, the Move-to menu, the drawer buttons and `board.move` all go through
`transition()`.
