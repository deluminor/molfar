# Migration status and working location

Updated November 3, 2026.

## Authoritative line

Continue manual migration in `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar` on `migration/gpui-into-main`. The single integration PR is [#127](https://github.com/deluminor/molfar/pull/127), targeting `main`. React/Tauri remains production; GPUI is an experimental preview.

The secondary `sync/gpui-20261101` worktree preserves M01a checkpoint `6b08aa29`. Both commits have been fast-forward integrated into the authoritative line. Retain that worktree and its evidence; continue manual feature work in the main checkout. Sync automation may use an isolated worktree under its own documented rules.

The line includes M01a (`eab8b0bb`, `6b08aa29`), main through `5ee67cce` (already released v1.0.23, reconciled in `f98187b8`) and readiness M02, M03, M08a and M08b. The changelog preserves connector additions under Unreleased and the v1.0.23 notes. This integration does not publish a release.

The [M01–M22 feature transfer register](feature-transfer.md) separates implemented
code, automated evidence and remaining native/runtime work. It is the concise
tracked status index; it supersedes dated status summaries in ignored local
plans, which retain the detailed execution history. Old local checkboxes do not
override the current register or establish runtime parity.

## Delivered and remaining

M01a adds owner answers/change requests, versioned plan editing and repeated Grill. Readiness M02 (`ff780975`..`2369ba98`) adds plan approval and native Implement/Code review/Rework execution through Final review. Readiness M03 (`4fe5dc0c`..`238aa1fe`) adds delivery, reject and archive. Readiness M08a (`f0899eb6`..`db9ac988`) adds task editing and Move to…; M08b (`e8b98c67`..`1ae5270f`) adds kanban columns and drag-and-drop. [Verification](verification.md) records tests/builds for those checkpoints, not certification of later revisions or runtime parity.

Next: native Jira and Confluence (readiness M04/M05). Full native Jira/Confluence, Home/Usage and Knowledge remain open. Scheduler, Familiar heartbeat/delegation, shared data, provider and platform acceptance need runtime evidence. See [parity](parity.md) and [architecture](migration.md).

## Planning

`docs/specs/` is Git-ignored local planning. Preserve it when moving work; committing tracked docs does not publish these files. The main checkout now contains the original `gpui-integration-pr` roadmap and newer merge-readiness/owner-review checkpoints. Roadmap M01–M22 and readiness M01–M08 are different namespaces: roadmap M02 means session reconciliation; readiness M02 means the next Board execution slice.

Local continuation entrypoint: `docs/specs/gpui-merge-readiness/handoff.md`. Remaining backlog: `docs/specs/gpui-merge-readiness/blockers.md`. Dated historical entries are superseded by their current follow-up sections.

## Publication and sync

The latest upstream integration checkpoint is `8ef99c49`, bringing upstream
`main` through `00c69307` onto the existing MOLFAR line, including product `main`
through `5ee67cce` (v1.0.23). PR #127 remains open and ready for review by the
human's decision. The subsequent CI-repair follow-up does not add feature ports.
See [verification](verification.md) for revision-scoped local and remote results;
re-read the current PR head/CI before publication.

Upstream sync now takes all code from the upstream `main` into `migration/gpui-into-main` only, as approved on November 3. There is no separate desktop sync into MOLFAR `main`. The human completes migration and merges #127; the automation then stops for an explicit target-policy update. The [canonical prompt](../automations/upstream-sync.md) is ready for the user to install; installed automation configuration was not changed in this run.

## Board polish follow-up — November 4, 2026

Jira readiness M04 is deferred by the owner. The approved Board polish is
implemented in `32aeae48` over `9e9974fd`: compact controls, opaque drawer, accessible
Edit placement, independently folded Markdown task/criteria, grouped settings and
readable drag previews. Full native checks and optimized macOS build passed; see
[verification](verification.md). Actual native UI QA was refused by Computer Use,
so visual/runtime acceptance remains open. Publication to the existing PR #127
was authorized separately by the owner; no merge, release or cutover is included.
Remote CI for this follow-up must be read at its published head.

## Native Board desktop presentation — November 4, 2026

The owner approved the TSX-reference presentation plan and 28px header controls.
The local follow-up reserves width for the detail panel, adds a visible horizontal
scrollbar within the remaining Board viewport, and replaces flat details with
Overview, artifact/version tabs, compact metadata and a stage timeline. The project
filter uses real workspace projects and appearance; column settings use anchored
model/access/skills controls. Independent review fixes cover reader invalidation,
project-filter resets, nested-picker Escape and acknowledged settings reloads.

Native UI access was refused by Computer Use, so screenshot comparison and real
window visual acceptance remain blocked. Automated verification is recorded in
verification.md. This follow-up does not publish, merge or release the branch.
