# Task Board

A global Kanban board whose agent stages run in hidden, Board-owned sessions. Spec and plan live in
`docs/specs/task-board/` (local, git-ignored); later changes in `docs/specs/board-*`.

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
the model in the shared `provider:model` form.

## Stage contract

- The engine copies the stage's input artifacts from app data into the worktree's git-ignored
  `.molfar/board/<kind>-v<version>.md` (`task_board_inputs_materialize`) and the prompt lists them as a
  manifest; bodies are never inlined. The folder holds a `.gitignore` of `*`, so checkout guards ignore it.
- The stage returns its artifacts between
  `<<<MOLFAR:kind>>>` / `<<<END:kind>>>` markers in its final message. The session port captures the full
  turn text at settlement (the settlement outcome alone is capped at 20 000 characters).
- Grill and Code review run in `auto` mode; HEAD and `git status --porcelain` must match before and after.
- Implement and Rework must finish with a clean tree and at least one new commit, and their
  `impl_report` must carry one `Status: complete | partial | blocked` line (`contracts/status.rs`).
- Code review starts its review block with an acceptance-criteria checklist and reports every finding in
  one pass; follow-up reviews read `git diff <last reviewed head>..HEAD` plus the previous review.
- A run is recorded before each side effect (`accepted → session_prepared → turn_submitted → settled`);
  reconcile turns runs whose session vanished into `interrupted`.

## State machine

`backlog → grill → plan_approval → implement → code_review → final_review → (rework → code_review)* → done`.
Plan approval and final review are manual gates; `implement`/`rework` success advances to `code_review`
automatically. PR and squash-merge deliveries wait in `final_review` with run state `ci` until the pull
request's checks decide. Drag-and-drop, the Move-to menu, the drawer buttons and `board.move` all go through
`transition()`.

## Automation (native)

`lifecycle/storage/outcome.rs` decides what a verified run leads to; every loop has a durable budget.

| Trigger | Engine action | Budget |
| --- | --- | --- |
| `Status: partial` | Run status `partial`, same stage queued again with the latest report | 3 in a row |
| `Status: blocked` | Card fails with the blocker message | — |
| Review with blocking/major findings | Rework brief (source `engine`, findings except nits), card to Rework | 2 since the user's last brief |
| Project verify command red before Code review (`stage/verify/`) | Run status `redirected`, brief (source `checks`) with the output tail, card to Rework | 2 shared with CI |
| PR checks red (`delivery/ci/`, polled each minute) | Brief (source `checks`) with failed checks and log tails, card to Rework; a clean review then redelivers to the same PR | 2 shared with checks |
| Any of the above | Stop at Final review or failed | 10 Implement/Rework/Code review runs since the last user decision or user-needed stop |

The verify command is a per-project Board setting (`verifyCommands`), run with the GUI PATH, `CI=1` and a
30-minute timeout in the card checkout.

Sessions (`store/task_board/reuse.rs`): Grill rounds share one session and Implement, continuations and
Rework share another while the agent, model settings, plan and session state are unchanged and the
previous run ended well; Code review always starts fresh. A reused session at 75% context is compacted
before the next prompt, which is queued as the session's next message so its turn id still matches the run.

