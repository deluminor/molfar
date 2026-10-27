# GPUI migration implementation plan

Status: **proposal awaiting detailed approval**. Local setup and documentation are already authorized and completed; no feature code has been written. Scope supersedes the previous stay-on-Tauri recommendation because Erik selected native adoption.

## Goal

Build MOLFAR on the current upstream GPUI architecture while preserving evidenced MOLFAR behavior, isolating data, reducing duplicate logic and maintaining an explicit upstream integration line.

## Technical Approach

Start `migration/gpui` directly at upstream GPUI, retain its history, and add narrow MOLFAR deltas. Reuse native provider/store/Mono/editor/terminal/settings/inbox foundations. Port absent domain behavior (durable Board, Confluence, Knowledge, custom gateways/dashboard) into focused Rust core services and native GPUI views. Translate TS behavioral fixtures and data contracts; do not bring the entire React runtime or a second provider reducer into a permanent sidecar. Any later sidecar exception requires evidence and separate approval.

Adapt existing native modules before inventing helpers or services. Proposed concern folders are ownership boundaries, not mandatory directory churn. Keep upstream-sensitive identifiers/modules where practical; display Familiar naming and explicit import compatibility need not rename all Mono symbols. No new dependency or framework choice is presumed approved by this plan.

## Architecture Overview

- Native entry/bundle identity selects only MOLFAR migration data/config/update channels.
- Core provider/session runtime owns normalized events, durable state, cancellation, approval and capabilities.
- Core Familiar/Mono, Board, connector, Knowledge and artifact services call shared session/action/file/Git boundaries.
- CLI, Companion HTTP and native QUIC are separate transports using the same authorized domain commands and idempotency rules.
- GPUI views render compact projections and invoke commands; provider/HTTP/Git/DB/scan work stays on workers. Native lifetime owns cancellation, not a transient view.
- Explicit copied-data importer maps original identities/preferences/schema; automatic adoption of installed profiles is disabled in migration builds.
- MOLFAR main and PR119 remain source/rollback baselines. Never merge their unrelated history into the native migration line merely to copy feature code.

## Risks & Mitigations

| Risk | Impact | Mitigation / owner |
|---|---|---|
| Native release defaults select installed MonoCode data | Production mutation or identity collision | M01, G1 isolation matrix before any runtime |
| Nested worktree excluded crate finds outer Cargo workspace | Full format/build metadata fails | G0-BUILD: diagnose and propose narrow local native build-boundary fix; no parent Cargo edits |
| Dependencies unavailable offline | No build/test evidence | Preserve logs; after approval use locked dependency resolution and record toolchain; never label blocked test pass |
| Native mappings omit MOLFAR metadata/settings | Data/behavior loss | G2 copied-data manifest, round-trip/idempotent import and unsupported-field report |
| Duplicate dispatch or action retry | Repeated writes/runs | M08/M11 transaction, receipts, stale callback and crash-phase tests |
| Imported schedules/listeners start automatically | Unexpected work/network exposure | M01/M06/M20 disabled until reviewed enablement; no router code/dependencies |
| Pending code mistaken for shipped | Incorrect scope/parity claim | Pinned M/H/L/S/U statuses and M22 backlog boundary |
| HTML fallback / IME / notification platform gaps | Cross-platform regression | G9 platform matrix, real runtime evidence later or explicit product waiver |
| Source force-push or squash cutover | Wrong merge/checkpoint | Ancestry gates; no resets/automatic rebases; explicit reconciliation/cutover approval |
| MOLFAR history guard rejects native ancestry | Future CI/release blocked | G1-SYNC scope native policy separately; do not change existing main automation today |

## Execution Stages / independently reviewable batches

Batch names use G0–G9 to avoid confusion with the stopped hardening B7.

| Batch | Scope / inventory IDs | Prerequisites | Checkpoint |
|---|---|---|---|
| G0 | Setup/planning (complete); baseline environment remediation proposed | Detailed approval before remediation | Correct worktree; source-preservation proof; locked native toolchain can run full gates |
| G1 | Identity/storage/credentials/packaging M01; mandatory no-router policy M20; sync policy/checkpoint | G0-BUILD and approval | No production path/update/profile collision, no automatic scheduler/listener/router; native sync isolated |
| G2 | Sessions/provider/PTY/Git M02/M03; copied DB/preferences M17; foundational CLI M11, artifact storage/security M18, hardening M21 | G1 | One copied session streams/reopens/stops; fixture replay and crash tests; protected HTML contract and operator receipts |
| G3 | Familiar roster/projects M04, files/memory M05, habits M06, completion grouping M07 | G2 | Copied Familiar lifecycle and grouped completion fixture matrix; no implicit scheduled execution |
| G4 | Durable Board M08, per-stage model/skills/gates M09, worktree/artifact handoff M10; Board actions in M11/M18 | G2/G3 where Familiar interaction needed | One real existing Board pipeline, crash/retry/cancel/gates/provenance tested end-to-end with isolated fixtures |
| G5 | Jira hierarchy M12, Confluence and connector MCP/actions M13 | G2, native connector/account boundaries | UI/CLI/MCP return consistent scoped content and handle stale/auth/cancel paths |
| G6 | Knowledge vault M14 | G2/G5 shared file/connector primitives | Scan/cancel/link/revision/asset fixtures plus keyboard-accessible native reader; graph follows same service |
| G7 | Home M15, Usage M16, settings/palette polish M17 | Underlying data services and preference import G2 | Saved layout intent preserved, usage sources truthful, reduced motion and keyboard operation |
| G8 | Companion v2 M19, pending native phone/client M20; no-router protection already mandatory G1 | M04–M14 dependencies per advertised capability | Both transports use same action policies; versioned capability and external-client/device checks later |
| G9 | M21 remaining semantic hardening, full parity/performance/platform/release/sync acceptance | All approved required slices | Auditable parity matrix, safe rollback, supported-platform package/runtime evidence; no automatic cutover |

G4/G5/G6/G7 can be developed in separate review slices after shared contracts stabilize, but this does not authorize multi-agent writes or concurrent changes now. Within each slice: characterize existing behavior; reuse native equivalent; implement smallest delta; run focused regressions; validate acceptance; update checkpoint/tasks. Improvements remain proposals until that slice's detailed plan is approved.

## First approved native vertical slice

After G1 isolation, use one copied saved session, deterministic provider replay, Familiar soul/memory access, one minimal Board stage through a native session port, and one HTML artifact. This is an early feasibility/parity checkpoint, not permission to run the current upstream executable against production data.

Acceptance: normalized events/approvals/cancel/final text match; source metadata/files unchanged; stale hash rejected; Board settles once and STOP prevents dispatch; no child survives cancellation; HTML isolation intact; no listener/scheduler starts automatically. Measure baseline and candidate on the same machine/workload before choosing performance budgets.

## Testing Strategy

1. **Static/build:** scoped/native-wide rustfmt; locked cargo check/build, all-target strict Clippy, native core tests; Node native-script tests; format/type/lint/test any changed mobile/host/editor asset code using its own commands. Full native commands in package.json are source of truth. Run dependency/license/security checks for changed boundaries/dependencies; do not carry old versions merely because PR119 bumped them.
2. **Behavioral fixtures:** normalize old TS test vectors into native cases for event order, stale account/session results, approvals/questions, idempotency, paused STOP, memory hashes, schedule/DST, completion groups, Board recovery and artifact versions. Test public behavior, not old React effect structure.
3. **Real isolated storage/integration:** copied/synthetic SQLite and temp files, source hashes, interrupted import, concurrent writers, corrupt JSON backup, unknown fields, two imports, missing permissions/disk failure. Never read live user data to make a test pass.
4. **Boundary tests:** malicious HTML/navigation/resize; vault paths/symlinks; connector redirects/cache/account switch; phone revoked/stale/replayed input and mapping dependency guard; inherited Git environment and dirty worktree safety.
5. **Native UI/device verification later, explicitly authorized:** keyboard/screen-reader/IME/focus/scroll anchors, empty/loading/error/retry/cancel/recovery, HTML/media, terminal, notification click routes and each required OS. Compile/test success does not imply runtime parity. Mobile AGENTS.md versioned Expo-doc rules apply before mobile code work.
6. **Performance:** fixed recorded fixtures for startup, idle memory, sustained stream, long history, large vault/Board and hidden animation. Record hardware/toolchain/workload, p50/p95 input/frame timings, CPU/memory plateau, startup/package measurements. Establish acceptable budgets after baseline measurement and approval; no unsupported speed/memory promise.
7. **Release:** independent bundle identity/feed/signatures, cancellation of updater, upgrade/rollback on copied data, supported OS/architecture matrix and external BitChain/phone compatibility. Text fallback or unavailable notification remains a blocker where existing required behavior needs it.

## Functional/data parity signoff

Every M01–M21 acceptance item has a PASS/FAIL/SKIPPED evidence entry, exact revision, command/test or manual reproduction, target platform and fixture. Required skipped items block release unless Erik explicitly waives scope. M22 remains outside parity. Pending PR119 policies are reviewed for inclusion, not assumed shipped; local-only commit evidence is kept separately. Rollback uses untouched current MOLFAR and original data; native and current app never concurrently edit the same profile.

## Manual upstream merge-based sync procedure (proposal; not enabled)

Current baseline checkpoint is docs/specs/gpui-migration/upstream-checkpoint.json. Future operational tracked checkpoint is proposed at `.github/gpui-upstream-sync.json`, containing repository, source branch, last integrated upstream SHA, last fully validated SHA, integration commit, validation evidence and source-transition history. Keep integrated and validated values distinct: this session's upstream baseline is integrated by branch creation but not fully validated.

1. With approval for an integration slice, verify remote URL and live source tip using ls-remote/API. Fetch into remote-tracking refs without altering source/main worktrees. Freeze the target SHA for that integration, even if upstream moves again.
2. Require current working tree clean and checkpoint source/identity match. Verify `lastIntegratedUpstreamCommit` is an ancestor of the frozen target using `git merge-base --is-ancestor`. Also verify last integrated commit is reachable from the native migration line; do not infer from branch name.
3. If ancestry fails (force-push/rewrite), STOP integration. Preserve old ref/object/checkpoint; compare old/new trees and range-diff where useful. Propose explicit reviewed reconciliation or replacement integration. Never reset migration, force-push, silently rebase its MOLFAR work or pretend rewritten commits are already integrated.
4. Create a separate project-local integration worktree/branch from migration/gpui. Merge the frozen upstream commit with explicit merge history, initially without committing, so conflicts and complete content can be reviewed. Do not merge into current MOLFAR main. No commit/push is implied by this session.
5. Resolve conflicts against feature inventory/contracts. Always inspect identity/data defaults, no-UPnP guard, permissions/STOP/receipts, copied-data schema/provenance, custom artifact/Board/connector/gateway fields and release identity. Conflicts are not resolved by deleting MOLFAR functionality or blindly preferring ours/theirs.
6. Run focused changed-path regressions plus full native core/GPUI/script/build/Clippy gates; host/mobile/editor gates if changed; copied-data parity and authorized platform smoke where relevant. Record failures/skips. Check full diff and security boundaries; no unattended merge.
7. Only after required gates pass and explicit integration approval, finalize merge/checkpoint together. `lastIntegrated` advances to the frozen source SHA; `lastValidated` advances only with complete required evidence. Preserve previous checkpoint and integration history. Offer ready-to-run commit/push commands only when requested.
8. Existing main content-patch scripts, scheduled automations and habits remain unchanged and continue serving their existing branch. No native merge is sent to them. Before any future native promotion, explicitly revise branch protection/history CI/release policy: main currently rejects any MonoCode ancestry (`.github/workflows/ci.yml:78–87`). The user-authorized upstream-rooted line is intentional; the old contributor-history policy cannot silently govern its eventual promotion.

### Source cutover after upstream GPUI moves to main

Verify live main SHA and inspect the actual cutover commit/content. If current validated GPUI checkpoint is an ancestor of new main, review remaining delta and run the normal staged merge gates. If main is still behind or missing GPUI, keep current source. If cutover is squashed/divergent, stop and prepare explicit history/content reconciliation; do not use --allow-unrelated-histories or reset as a convenience. Record old branch/checkpoint, new branch/first accepted main SHA and rationale in checkpoint history. Update only native sync source after validated approval; do not repurpose existing content-patch automation implicitly.

## Rollback and reversibility

Before runtime migration, rollback is simply using unchanged current MOLFAR; no source profile was modified. After approved copied-data runtime work, preserve import source snapshot and mapping manifest. Do not claim rollback across schema writes until native-to-source round-trip or restoration is tested. Migration branch removal is not part of this session; no worktree or branch cleanup is automatic.

## Constitution check

PASS for authorized setup/planning boundaries: existing work and STOP preserved, no attribution, no implementation, explicit evidence and approval gate. Proposed native history sync is an explicit user-requested exception to legacy content-patch-only direction, confined to the new line; existing main CI/policy remains unchanged. The nested Cargo failure is disclosed and assigned a narrow future remediation task, not worked around by changing main. No file-size-driven refactor targets included.

## Open approval gates

Detailed feature plan approval is still required before G0-BUILD/G1 or any implementation. Proposed importer defaults, required-platform release scope/waivers, performance budgets after baseline, mobile distribution and final main/source promotion require explicit decisions at their relevant gate. None blocks completing this authorized setup/inventory session. No feature work has started.
