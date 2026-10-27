# Publication and activation handoff

- Preparation: https://github.com/deluminor/molfar/pull/126, draft, head prep/gpui-native-sync; reviewed implementation commit 1df377246af56fb234bc57f82b52891d6faabdad.
- Frozen source: https://github.com/deluminor/molfar/pull/125, blocked draft, head gpui-sync/source-e6f58da1 at e6f58da15c0f603054bf684b957798941b0e05e0.
- Both bases are migration/gpui; observed target remains ea6c8219bae954a3d8a9e8c536242b9531a683f7. No target/main merge, release/tag/dispatch or scheduler operation.
- Attempted source records the frozen source proposal. Integrated pair remains baseline; validated remains null. All five tracked blockers remain open.
- Live inspect-only entrypoint exited 1 because migration/gpui does not yet contain .github/gpui-upstream-sync.json. This is the expected pre-acceptance refusal, not an operational readiness claim. The common-directory lock was released; unresolved evidence is retained.
- Proposed complete Wisp prompt and activation checklist: docs/automations/gpui-upstream-sync.md. Wisp must verify accepted tooling, dedicated clean checkout and permissions before installing/enabling its existing paused habit. Existing source PR125 is detected as a competing open sync candidate, so it must be deliberately resolved before another automatic source candidate can publish.
- Wisp notification could not be delivered: supported app sessions.list returned inactive app access (exit 1, retryable false). No private DB/session-store/credential fallback or repeated access attempt was used. Habit dc518d96-d12a-4a47-a06a-da89c00e9305 and old watch e9adb3fb were not modified.
- Full absolute session report: /Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar-worktrees/molfar-56bca169/scratch/gpui-preparation-and-sync-report.md.

CI checks are observed separately in that report and may still be pending; local passing checks and draft publication do not authorize merging or claim native feature parity. Source defect, baseline dependency audit, identity/no-router and release-feed blockers remain explicit. The original dirty native worktree, other registered existing worktrees, six local hardening commits and B7/release STOP remain preserved.
