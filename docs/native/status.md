# Migration status and working location

Updated November 5, 2026.

## Authoritative line

The sole upstream integration target is `migration/gpui-into-main`, with
[#127](https://github.com/deluminor/molfar/pull/127) targeting `main`.
React/Tauri remains production; GPUI remains a preview. The human controls
review status, merge and release decisions. This update does not refresh the
remote PR state or CI.

Current local checkpoint: `0eaa7ea0` on `sync/gpui-20261105`, in the isolated
`molfar-ad3f861b` worktree. It contains the Companion, release preparation, upstream
merge and review fixes. Check PR #127 for the published integration head.
Do not overwrite the main checkout's independent uncommitted work.

The upstream checkpoint file records `main` at `a25b5b899efbe244cc01d62e8d07269984fb7912`.
Sync commit `1cbf81da` is the latest one published to the integration branch.
The [feature transfer register](feature-transfer.md) and [limitations](parity.md)
separate code delivery from runtime acceptance; [verification](verification.md)
records revision-scoped results.

## Delivered and remaining

- Board: owner review/repeated Grill, plan approval, Implement/Code review/Rework,
  Final review, delivery/reject/archive, editing, kanban and legal drag/moves.
  Real provider execution and GitHub delivery acceptance remain open.
- Home: ten widgets, editable persisted layout, Usage widget and sphere motion.
  Native-window interaction/visual acceptance remains open.
- Companion: HTTP/Tailscale gateway, phone RPCs, Familiar live ownership,
  validated launch choices, cancellation and checkout rollback in `8840e63c`.
  Real BitChain/Tailscale/provider acceptance remains unrun.
- Full Jira hierarchy/actions, native Confluence and Knowledge/vault/graph/revisions
  remain unfinished. The owner deferred Jira while polishing Board.
- Scheduler, Familiar heartbeat/delegation, restart recovery, shared data and
  provider/platform acceptance remain open.

## Merge preparation: November 5, 2026

The owner approved steps 1–3 below. Local changes fix the sphere geometry/import
lints, add main native validation, and prepare the separate Native package/release
workflow. The Companion commit is a direct descendant of the fetched integration
head; no additional main merge was needed. Final checks and publication status
are recorded in verification.md. No PR merge or release publication is included.

## Acceptance order

1. Verify the native gate fixes: the sphere painter now accepts existing bounds,
   and the `Sampler` test import uses the same platform gate as its test. Run the
   complete native gate and platform CI on the intended integration head.
2. The local Companion commit is reconciled with the integration branch. Publish
   only with authorization, then recheck PR #127 and exact-head CI.
3. Define and implement two release channels: retain the Tauri release and add
   a separate MOLFAR Native preview, with distinct artifacts, identifiers,
   update policy and packaging checks. The local preparation now implements this
   path; hosted builds, signing and publication acceptance remain open.
4. With runtime QA authorization, test isolated data first: phone pairing and
   reconnect, provider send/stop/approvals, restart persistence, terminal/Git/
   worktrees, Board delivery and Familiar scheduling. Shared production-data
   concurrency needs a separate acceptance run.
5. Finish or explicitly defer Jira, Confluence and Knowledge scope before
   claiming desktop feature parity. Decide preview-merge acceptance separately
   from full product cutover.
6. After the human merges #127, stop the existing sync job until an explicit
   target policy is approved. Tracked instructions do not verify an installed
   automation's configuration.

## Planning

`docs/specs/` is Git-ignored local planning. Preserve it when moving work; committing tracked docs does not publish these files. The main checkout now contains the original `gpui-integration-pr` roadmap and newer merge-readiness/owner-review checkpoints. Roadmap M01–M22 and readiness M01–M08 are different namespaces: roadmap M02 means session reconciliation; readiness M02 means the next Board execution slice.

Local continuation entrypoint: `docs/specs/gpui-merge-readiness/handoff.md`. Remaining backlog: `docs/specs/gpui-merge-readiness/blockers.md`. Dated historical entries are superseded by their current follow-up sections.

## Publication and sync

The current recorded source is upstream `main` through `a25b5b89`; only
`migration/gpui-into-main` receives upstream patches. See the latest
[verification](verification.md) entry for local results and unresolved gates.
Do not infer current remote CI or PR readiness from historical green runs.

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

## Native Home — November 4, 2026

The owner approved a native Home with all ten desktop widgets, full layout editing and
Usage as a Home widget only. Home is first in sidebar and project-rail navigation; the
launch view is unchanged. Widgets adapt to their cell size and animate on the shared
pulse clock (Brand, Matrix) or their own one-second tick (Clock), pausing when hidden
and drawing still frames under reduced motion. Records poll only while Home is shown.
Native UI access is still unavailable, so visual acceptance remains open; automated
verification is recorded in verification.md. Nothing was published.
