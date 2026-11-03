# Migration status and working location

Updated November 3, 2026.

## Authoritative line

Continue manual migration in `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar` on `migration/gpui-into-main`. The single integration PR is [#127](https://github.com/deluminor/molfar/pull/127), targeting `main`. React/Tauri remains production; GPUI is an experimental preview.

The secondary `sync/gpui-20261101` worktree preserves M01a checkpoint `6b08aa29`. Both commits have been fast-forward integrated into the authoritative line. Retain that worktree and its evidence; continue manual feature work in the main checkout. Sync automation may use an isolated worktree under its own documented rules.

The line includes M01a (`eab8b0bb`, `6b08aa29`), main through `5ee67cce` (already released v1.0.23, reconciled in `f98187b8`) and readiness M02, M03, M08a and M08b. The changelog preserves connector additions under Unreleased and the v1.0.23 notes. This integration does not publish a release.

## Delivered and remaining

M01a adds owner answers/change requests, versioned plan editing and repeated Grill. Readiness M02 (`ff780975`..`2369ba98`) adds plan approval and native Implement/Code review/Rework execution through Final review. Readiness M03 (`4fe5dc0c`..`238aa1fe`) adds delivery, reject and archive. Readiness M08a (`f0899eb6`..`db9ac988`) adds task editing and Move to…; M08b (`e8b98c67`..`1ae5270f`) adds kanban columns and drag-and-drop. [Verification](verification.md) records tests/builds for those checkpoints, not certification of later revisions or runtime parity.

Next: native Jira and Confluence (readiness M04/M05). Full native Jira/Confluence, Home/Usage and Knowledge remain open. Scheduler, Familiar heartbeat/delegation, shared data, provider and platform acceptance need runtime evidence. See [parity](parity.md) and [architecture](migration.md).

## Planning

`docs/specs/` is Git-ignored local planning. Preserve it when moving work; committing tracked docs does not publish these files. The main checkout now contains the original `gpui-integration-pr` roadmap and newer merge-readiness/owner-review checkpoints. Roadmap M01–M22 and readiness M01–M08 are different namespaces: roadmap M02 means session reconciliation; readiness M02 means the next Board execution slice.

Local continuation entrypoint: `docs/specs/gpui-merge-readiness/handoff.md`. Remaining backlog: `docs/specs/gpui-merge-readiness/blockers.md`. Dated historical entries are superseded by their current follow-up sections.

## Publication and sync

On November 3, 2026, PR #127 was pushed to `785dc7e3` (readiness M08b and its documentation) and remains ready for review; its description reflects the native Board through delivery, editing, kanban and drag. Remote CI for that head has not been recorded here. Re-read remote head/CI before further publication and preserve ready-for-review status.

Upstream sync remains Phase 1 while #127 is open; Phase 2 starts after merge and native exists on main. The [combined prompt](../automations/upstream-sync.md) is tracked guidance. Installed automation configuration still needs a separate live comparison.
