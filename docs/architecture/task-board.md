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

## Native preview

`crates/molfar-core/src/task_board/` reads the same desktop tables and creates
idle Backlog cards with their initial versioned task snapshot. Existing IDs
make retries safe after a partial card/file save. Artifact publication never
replaces conflicting files; registered snapshots remain immutable. Existing
databases are not migrated.

`crates/molfar-gpui/src/task_board/` owns the native list, detail and creation
dialog. Database and artifact IO run in the background. The dialog reuses
native fields, modal controls and reduced-motion-aware transitions.

The first Grill round runs natively. `task_board/stage/` owns the Start, Retry and
Cancel transitions, claims, the retained card worktree, the read-only checkout
fingerprint, ignored input handoff, the template prompt and the output parser.
The shell coordinator (`shell/board_runtime/`) installs one visible, Board-owned
session through the normal Conversation path. It settles only from the durable
turn receipt, never auto-replays a prompt after restart, and keeps running when
the Board is closed. Board sessions stay in project history but are hidden from
Familiars and phone access. `task_board/stage/transitions/` ports the shipped transition table for every
Board action; native decisions go through it under the card revision check.
`stage/choice/` resolves model, access and skills per stage and saves Board
settings as field-level patches that the desktop Board can still read. Runs record
the model in the shared `provider:model` form. Later Grill rounds,
Implement/Review/Rework runs, plan approval and delivery remain planned.

## Stage contract

- The engine copies the stage's input artifacts from app data into the worktree's git-ignored
  `.molfar/board/<kind>-v<version>.md` (`task_board_inputs_materialize`) and the prompt lists them as a
  manifest; bodies are never inlined. The folder holds a `.gitignore` of `*`, so checkout guards ignore it.
- The stage returns its artifacts between
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
