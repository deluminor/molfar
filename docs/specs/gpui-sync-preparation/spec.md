# GPUI preparation specification

Approved scope: Erik explicitly authorizes bounded preparation, automation corrections, normal commits/pushes and review PRs targeting migration/gpui. This supersedes earlier read-only preparation restrictions, not feature migration or main cutover gates. Grill skipped: frontier empty; use existing native baseline and two review PRs at most.

## Requirements
R01 Preserve all other worktrees, original dirty planning, six hardening commits, B7 and release STOP, PR123 and paused habits.
R02 Base preparation on origin/migration/gpui; preserve independent native history. Link assessment PR124. No main merge, fabricated ancestry, tree duplication, releases, dispatch or protected-ref writes.
R03 Implement dedicated native source/target checkpoint with attempted, integrated and validated states. Proposed source changes advance attempted only. Persistent unresolved ledger must never disappear on equality or retry.
R04 Refuse source rewrite, unexpected remotes, target/checkpoint mismatch, source cutover and dirty checkout. Atomic per-repository channel lock; deterministic candidate, duplicate PR and final remote SHA checks; normal push only. Scheduled entrypoint creates/updates PRs into migration/gpui only, never auto merges.
R05 Review frozen upstream delta before source PR. Preserve MOLFAR deltas and original documents. No automatic conflict resolution or imported publishing credentials/workflows.
R06 Correct native CI actual branch and add meaningful regression tests. Provide isolated build validation without changing parent manifests or launching application.
R07 Keep identity/storage/credentials/update feeds, no-UPnP/NAT-PMP and M01-M21 parity as explicit runtime/release blockers. M22 remains proposals. No full feature port. Release-feed rerun defect may remain explicitly blocked if repair broadens publishing scope.
R08 Save complete proposed Wisp habit prompt, activation checklist and exact verification report at scratch/gpui-preparation-and-sync-report.md. Never mutate any scheduler. Notify Wisp through supported public access if available.
R09 Meaningful failure/concurrency/retry tests, independent strong review and d-verify with exact exits/skips. Verify published PR bodies contain no attribution.
