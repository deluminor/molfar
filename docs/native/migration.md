# Native architecture

The GPUI app is an experimental preview alongside the production React/Tauri
app. The existing implementation in `src/` and `src-tauri/` is the behavior
reference. Production builds, CI, releases and updater feeds continue to use Tauri.

## Code layout

| Location | Responsibility |
| --- | --- |
| `crates/molfar-core/` | Provider transports, persistence, accounts, Git/files, remote connections and shared services |
| `crates/molfar-gpui/` | Native shell, composer, transcript, editor, settings and platform UI |
| `crates/molfar-gpui/Cargo.toml` | Independent native Cargo workspace, profiles and dependency patches |
| `scripts/dev-native.mjs` | Development build and manual restart runner |
| `scripts/build-native.mjs` | Optimized build and macOS packaging |
| `scripts/native-editor/`, `scripts/native-settings/` | Generators for embedded JavaScript assets |
| `vendor/gpui-pre*/` | Pinned framework and platform patches |

`molfar-core` has no Tauri or GPUI dependency. Keep provider and storage
behavior in core services, with UI work in GPUI views. Development uses isolated
data; release builds use the installed desktop database. See the
[native guide](README.md#data-and-configuration) for paths and commands.

Provider transports use Codex app-server, Claude stream-json, OpenCode HTTP/SSE,
ACP for Cursor/Grok/Antigravity/fx/Hermes/Devin, and Pi/omp RPC. They reuse the
providers' CLI authentication and conversation IDs.

## Durable turn results

The existing native worker saves optional terminal provenance on the original
prompt before its final UI update. Success, failure and cancellation are explicit;
timing and UI readiness never imply success. Final transcript or handoff save
failures prevent a successful terminal result. Receipt writes preserve unknown
desktop fields and do not rewrite composer preferences or migrate tables.

`Store::app_turn_result` uses the existing durable app request identity to read
the complete persisted assistant output for that root, including explicitly
joined steers. It bypasses UI paging and control-output limits, rejects ambiguous
provenance, and treats missing terminal data as unknown. The native Board Grill
lifecycle consumes this boundary for durable settlement and recovery through the
existing native session runner. Owner answers and change requests create immutable
user artifacts before queueing the next round; plan
edits create new versions without replacing prior output. Decisions check the
card revision before writing. Later rounds receive versioned task/spec/plan/answers
handoff files and questions from the newest successful Grill run. Legacy cards
missing required artifact metadata retain the task-only fallback; unreadable
registered artifacts remain explicit errors. Native artifact reads reject
symlinks/nonregular files, empty bodies and oversized content.

Readiness M02 extends the same lifecycle to Implement, Code review and Rework.
Plan approval queues Implement only from the idle, unarchived Plan gate at the
expected revision. Each agent stage freezes its model, access and skills at
acceptance and receives immutable versioned handoff files. Implement and Rework
must start on a clean retained worktree and finish clean on a new HEAD; Grill
and Code review must leave the checkout snapshot unchanged. Output is validated
against the run's own stage contract before publication, so wrong-stage or
prior-run receipts cannot settle a newer run. Code review always ends at Final
review. Owner-selected findings and a note form a rework brief bound to the
current review version and increment `rework_cycle`. Back from a failed Code
review or Rework to Final review requires a readable completed review; otherwise
Retry remains the available path.

Readiness M03 adds delivery, reject and archive through
`task_board/delivery` over a `DeliveryPort` that reuses the existing scm, GitHub
and worktree helpers. Final review locks the card in running, refuses
`remote://`, missing or foreign worktrees and dirty checkouts, then pushes,
opens or adopts a pull request and squash-merges, persisting each step in
`delivery_json` so a retry never opens a second PR or merges twice. Pull request
text follows desktop (spec `pr_title`, PR description or task/report fallback,
review footer, 60 000-character cap); stored full base refs are normalized to a
branch name. Done writes an immutable `delivery` artifact, removes the worktree
only when clean, keeps the branch and detaches stage sessions. A worktree still
in use, or a failed removal, still reaches Done with a warning. The Store lock is
released around every git and gh call. Startup fails a delivery interrupted by
quit; retry finishes a delivery whose cleanup already ran.

Reject archives first, then force-removes the worktree and deletes the task
branch only when it is a `molfar/task-` branch with no upstream and no attached
worktree. Archiving a Done card deliberately differs from desktop: it never
deletes the branch and only removes a leftover clean worktree. Known limits:
git push and gh have no timeout, so a hung credential prompt keeps the card
Delivering until restart; clean-worktree removal ignores gitignored files, as on
desktop; and a desktop and native app delivering from one database at once is
unsupported.

Readiness M08a adds an EditTask owner action and `transitions::moves::legal_moves`.
Editing is legal only for idle, unarchived Backlog and Plan approval cards at the
expected revision; the base branch can change only in Backlog. Create and edit
share field validation and the task snapshot format, and the edit writes the
card fields and a new task artifact version in one transaction, so later stages
read the newest task. Move to… offers the desktop drop targets: Start, Approve
plan and Back run directly (Back only when the readable-review guard allows
it), while Request changes, Rework and Deliver open the owner panel they need.
Background delivery results use a separate path from owner action results, so a
long delivery cannot complete an unrelated edit or review. See
[migration status](parity.md#application-work).

## Rendering and responsiveness

Keep provider I/O, parsing, file access and persistence off the UI thread.
Composer input should not rebuild the transcript. Transcript rows have stable
identities, bounded blocks and virtualized layout; streaming updates should
preserve the reader's position. Cancellation must remain responsive under load.

The editor embeds generated analysis and formatting bundles. After changing their
source services or dependencies, run `npm ci` and `npm run build` inside
`scripts/native-editor/`. Generated bundles and their license notices belong
in the repository.

## Framework patches

GPUI and its platform crate are pinned to `gpui-pre` 0.3.9. Local Apple renderer
patches cover alpha blending, font matching, backdrop blur and shadows. The
headless Metal regression is documented in [verification](verification.md).

The vendored framework/platform crates remove the unused `zed-scap` dependency.
The native build rejects lockfiles that reintroduce it, and the `screen-capture`
feature remains disabled. Preserve these guards and the licenses in [NOTICE](../../NOTICE).

See [preview limitations](parity.md) for current release work. Tauri remains the
production app until an explicit cutover.
