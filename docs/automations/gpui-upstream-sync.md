# GPUI upstream sync — superseded

Updated November 2, 2026. Use the combined
[Sync MonoCode upstream (main + GPUI)](upstream-sync.md) prompt.

MonoCode merged its GPUI branch into `upstream/main`. The old separate prompt
fetched the dormant `mc/migrate-monocode-to-gpui` branch and must not be used for
new runs. The GPUI state file now tracks `main` while retaining its own synced
commit independently of the desktop state file.

- Phase 1: desktop changes reach `main` through a sync PR; native and shared
  changes reach `migration/gpui-into-main`, the head of PR #127.
- Phase 2: after #127 is merged and native exists on `main`, the combined job
  syncs everything through one PR into `main`; Part B is skipped.
- Preserve the human-selected draft/ready status and parity claims. Sync jobs
  never merge PRs, publish releases or activate providers.

The separate job's historical schedule is not a current configuration claim.
This documentation update did not disable, enable or reschedule any installed
automation. Inspect the automation configuration before retiring old jobs or
installing the combined prompt; do not run both against the same refs.
