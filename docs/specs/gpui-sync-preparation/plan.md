# GPUI preparation implementation plan

## Goal
Prepare a reviewed native sync channel and source update candidates without promoting the migration.

## Technical Approach
Use Node standard library tooling and Git/GitHub CLI, reusing native script conventions. Native source is hardbeat920/monocode mc/migrate-monocode-to-gpui; target deluminor/molfar migration/gpui. Separate tracked checkpoint and unresolved ledger from old main patch sync. Maintain a persistent Git-common-dir channel state/lock for attempts and candidates; preserve evidence after failure. Use isolated candidate worktrees, deterministic branches and non-forced pushes. Runtime unresolved state in the Git common directory is authoritative across failed attempts; every candidate carries a tracked snapshot. Retry unions entries by stable ID, never dropping an unresolved item absent explicit resolution evidence. Refuse protected upstream changes to workflows and release/publishing owners before merge; report them for separate review rather than stripping files and claiming full integration. Checkpoint integrated/validated remain baseline/null until a separately reviewed target integration and complete validation.

## Architecture Overview
- Native sync entrypoint validates repository/channel, takes atomic lock, snapshots remote refs and checks ancestry/cutover.
- Candidate preparation merges frozen source only in a dedicated worktree. Conflicts are retained/reported in ledger and require human resolution.
- Publication checks remote source/target/candidate and duplicate PRs immediately before writing. It can publish only a review PR into migration/gpui.
- Validation helper performs only static/compile/test operations in isolated checkout, never launch or package/publish.
- Documentation supplies Wisp final prompt and blocked activation checklist; scheduler remains paused.

## Risks & Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Rewrite/race | wrong integration | ancestry, final SHA checks, atomic lock, no force |
| Lost unresolved ports | false completion | durable ledger and separate checkpoints |
| Production profile/router access | data/network mutation | no native runtime; explicit M01/M20 blockers |
| Enclosing Cargo workspace | invalid validation | isolated export outside enclosing workspace; no parent edits |
| Release feed rerun | failed distribution recovery | retain explicit release blocker, no publishing change |

## Execution Stages
1. Preserve fingerprints and original evidence; verify refs; create native preparation branch.
2. Persist scope/plan/tasks; planner review and d-analyze before implementation.
3. Implement native sync checkpoint, lock/ledger/publication behavior and regression tests.
4. Fix/test native CI branch routing and isolated validation tooling.
5. Review upstream range and prepare separate frozen source-update PR if safe; record blockers.
6. Run verification and independent strong review, address findings, publish preparation PR.
7. Save Wisp prompt, activation checklist/report; verify PR bodies and preservation; notify Wisp.

## Testing Strategy
Node behavior fixtures with temporary repositories: happy path, unchanged source, unresolved retry, rewritten source, cutover, dirty state, lock contention, duplicate PR, stale remotes and failure cleanup. Native workflow regression and isolated tooling fixture. Real native scoped/full formatting, locked dependency resolution/check/build/Clippy/core tests where environment permits; exact failures/skips retained. No GUI/runtime tests.

Constitution check: approved scope overrides earlier no-commit preparation restriction; all main and runtime gates remain. No new product dependencies or feature contracts. No open consequential decisions.
