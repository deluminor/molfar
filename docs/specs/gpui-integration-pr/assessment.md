# GPUI integration PR and upstream automation audit

Evidence collected 27 October 2026. Scope: authorized draft preparation/publication and read-only automation audit. No native feature implementation, merge, release, tag, workflow dispatch, automation enablement, reset, prune, deletion or force push.

## Verified sources

| Source | SHA / status |
|---|---|
| Live origin/main | 3bb0af0c462761cc0f0e75be7984dc22fb15507f |
| Local migration/gpui | ea6c8219bae954a3d8a9e8c536242b9531a683f7 |
| Live upstream GPUI | 579afd27303b781f911f268cf67b41441c214549 |
| Live upstream main | 26465c620977f3951d0a532a0f7db32c3c179007 |
| PR117/119/120/121/122 | MERGED, verified with gh pr list |

Remotes: origin git@github.com:deluminor/molfar.git; upstream git@github.com:hardbeat920/monocode.git. No remote changed. GPUI is 19 commits newer upstream; migration is 0 ahead and 19 behind. No rewritten GPUI baseline detected. Source cutover has NOT happened: upstream main remains the Tauri line, and its SHA is not an ancestor of the latest GPUI branch. Do not change existing patch-sync source to GPUI.

## Integration representation blocker

`git merge-base origin/main migration/gpui` exits 1 with no output; `git diff origin/main...migration/gpui` reports `no merge base`. The histories are deliberately independent. Native ancestry also conflicts with main's current no-upstream-ancestry CI (.github/workflows/ci.yml:103-113).

Erik explicitly approved an assessment-only draft from main. A direct GitHub integration PR requires a separate safe history/porting decision. No fabricated merge base, unrelated-history merge, wholesale native tree replacement or conflict resolution deleting MOLFAR features was performed. Independent specialist recommends a main-descendant assessment-only draft PR that pins native source and parity evidence. Such a PR is preparation, not an implemented native migration. A complete second source tree would add substantial duplicated code and is not recommended by the independent reviewer. A real code cutover requires a separately approved main-descendant port or explicit history-policy transition preserving product behavior.

## Original evidence preservation

Read original docs/specs/gpui-migration/{spec,plan,tasks}.md, the full 856-line setup/inventory report and the 185-line assessment. Original files remain unchanged in the dirty registered native worktree. Ten planning/evidence files copied byte-for-byte into scratch/preserved-gpui-planning; scratch/planning-preservation.json records SHA-256 values and exact source paths. analysis.md now EXISTS (35 lines); its presence was verified instead of assumed. Historical analysis explicitly states that a second independent confirmation hit a usage limit; do not promote that to a completed second pass.

The original assessment's stay-on-Tauri recommendation predates Erik's GPUI direction and is superseded as a product decision. Its source evidence and limitations remain useful. Original documents' no-push/no-PR scope described the earlier session only; current request explicitly authorizes draft publication. Their pending PR status labels are historical: PR117 and PR119 are now merged. Native parity has not followed automatically.

The stale dirty main checkout was never used as current source or modified. This session worktree was fast-forwarded to verified origin/main. Existing worktrees, missing historical registrations, six unpublished hardening commits at 9e4eb453 and dirty /private/tmp/molfar-pre-b7 remain preserved. Changelog branch/worktree untouched. B7/release prep remains stopped. Installed dependencies were reused through local symlinks; no dependencies installed.

## Parity and readiness checklist

All unchecked native parity items remain blockers, not completed work. Shipped means code in verified MOLFAR main, not fresh runtime certification.

- [ ] M01: MOLFAR branding, bundle/protocol/update/notification/keyring identity; migration storage separate from both production apps, with copied data only and no fallback.
- [ ] M02: provider/session metadata, event order, streaming/tools/approvals/cancel, account-switch stale results and remote host contracts.
- [ ] M03: terminal lifecycle and replay, Git environment/remotes, retained worktrees and safe deletion; Windows separately verified.
- [ ] M04: Familiar roster/multi-project sessions and durable original-ID mapping; reuse native Mono capability.
- [ ] M05: soul/memory/topic/archive file bytes, hashes, redaction and conflict protection.
- [ ] M06: habits, DST/timeouts, exactly-one claim, hidden sessions, approval relay and STOP; imported schedules disabled.
- [ ] M07: accepted completion groups, rejected launches, stale retries, dismissal and queued reports. Restart durability is a proposed improvement.
- [ ] M08: durable Board stages/runs/claims/receipts/recovery and exactly-once settlement; cancelled cards cannot redispatch.
- [ ] M09: per-stage model/skill inheritance, frozen provenance and explicit plan/final gates.
- [ ] M10: retained Board worktree, versioned artifact fingerprints and FILE path handoff; no inline artifact-body substitution.
- [ ] M11: app CLI/MCP action scopes, request idempotency/effect receipts, approvals/questions and paused read-only STOP behavior.
- [ ] M12: Jira hierarchy and cycle/orphan/account handling.
- [ ] M13: Confluence tree/search/context/pagination/shared Atlassian config and connector CLI/MCP contracts.
- [ ] M14: Knowledge/Obsidian scan/link/graph/preview/revision/cancel and vault path safety.
- [ ] M15: Home widget/layout intent, real status data and reduced-motion branding visuals.
- [ ] M16: Claude/Codex/Cursor/Antigravity Usage sources, independent stale/error/last-good states.
- [ ] M17: settings/themes/defaults, explicit false versus missing, unsupported-field import report and cross-window persistence.
- [ ] M18: artifact provenance/cards and malicious HTML sandbox; Linux/Windows text fallback is a parity gap.
- [ ] M19: separate Companion HTTP/Tailscale v2 gateway and BitChain contracts, revocation/validation/default-off policy.
- [ ] M20: QUIC phone/mobile candidate now present in main through PR117, plus subsequent dependency fixes. Native no-UPnP/NAT-PMP removal still pending; upstream defaults/router dependencies must not ship or run.
- [ ] M21: semantic carryover of merged PR119 hardening: unread-snapshot guard, boot write failures, corrupt-config backup, phone validation, Git safety and visible MCP errors. Six local-only refactor/fix commits remain unpublished and unresumed.
- [ ] M22 boundary: Board card dependencies, Companion full-text vault search/push, restart-surviving completion groups/global Board pause and broad redesign remain backlog/proposals; not shipped parity obligations.

Additional merge blockers: full native build/check/Clippy/test evidence; dependency/security/license validation; copied-data import round-trip/recovery; supported-platform package/runtime/accessibility/IME/HTML/media/notifications; independent performance evidence; reviewed upstream history/CI/release policy and final cutover approval. No production app/data launch is authorized. Future native runs require isolated identifier/storage and copied fixtures first.

## Automation findings

Independent evidence-based specialist review completed using the strongest available reasoning role. Primary agent verified cited snippets and source refs.

1. HIGH — `origin/main:scripts/upstream/patch-sync.mjs:173-175` stages syncedCommit even with conflicts/pending ports. docs/automations/upstream-sync.md:141-142 allows unresolved Needs human items while pending manifests are ignored; lines 66-67 stop when an existing candidate's watermark equals source. Risk: unported changes disappear from future work scheduling. Proposed correction: tracked unresolved-port ledger; separate attempted/integrated/validated checkpoints, advancing completed watermark only after resolution. No correction applied.
2. HIGH — `migration/gpui:.github/workflows/native.yml:4-5` triggers push on mc/migrate-monocode-to-gpui, not migration/gpui. ci.yml only targets main push. Native branch pushes get no automatic native gate. Proposed mechanical patch: explicitly add migration/gpui to native push branches; verify required checks and future PR path policy. Approval needed before workflow behavior change.
3. MEDIUM — `migration/gpui:.github/workflows/native-release.yml:274-288` publishes GitHub release before mutable feed upload. If feed upload fails, rerun rejects already-published release and cannot recover normally. Proposed correction: verify immutable existing assets and permit identical feed-only retry. Publishing behavior change requires separate approval; no workflow invoked.
4. MEDIUM — `origin/main:docs/automations/upstream-sync.md:66-71` has check-then-create PR discovery and date suffixes with no atomic channel lock. Overlapping scheduler runs can create competing candidates. Actual scheduler serialization unverified. Proposed correction: repository/channel lock plus duplicate/remote-ref check immediately before publication; no schedule changed.

## Automation controls and visibility

Repository-defined existing sync: docs state Tuesday/Friday 09:00, claude:opus medium, worktree mode. This is a documented prompt, not proof of the live schedule. Checkpoint .github/upstream-sync.json is upstream/main@26465c6, matching live upstream main; equality is a watermark claim, not proof every earlier intent landed. apply.mjs defaults upstream/main; patch tool stages changes only and does not commit/push/merge. Rewritten sources return DIVERGED. Native target would fail that ancestry guard with the current main checkpoint.

Docs prohibit force push, protected-ref/upstream writes, importing MonoCode ancestry, dropping features and bypassing hooks. Identity, branding, release/updates, mobile accounts, no-router and licenses require explicit review. These protections are partly prompt/manual policy, not machine-enforced exclusions. No native .github/gpui-upstream-sync.json or native sync script found on migration; its checkpoint exists only in uncommitted planning with validated SHA null.

Native CI contents permission is read-only. Native release grants contents:write and publishes to R2; it is release automation, not upstream sync. Native workflow's push concurrency group uses run_id, so separate push runs do not cancel each other; PR grouping does serialize same-PR runs. No unattended merge setting was enabled or requested.

Actual NEW habit definitions/prompts, enabled state, live cadence/timezone, scheduler locks, execution permissions/history and cutover checkpoints could NOT be verified. `molfar app habits.list --json '{}'` first hit sandbox localhost restrictions, then an authorized escalated read returned `MOLFAR app access is inactive. Use /operator once in this thread ...`, retryable:false. No private DB, app config, credentials or tokens read; no repeated access attempts. Prior paused watch e9adb3fb is only user-supplied historical context; it is not assumed to be the new automation. Keep it paused until verified cutover and Erik's explicit enablement.

Verdict: NOT VERIFIED / corrections proposed. Existing patch-sync source matches current main line; native operational sync is not installed in repository evidence. Cannot certify actual new app automation until supported CLI access is enabled. No habits enabled, run or updated.

## Validation evidence

- Native packaging: `node --test scripts/native-release.test.mjs scripts/package-native.test.mjs` in immutable native export: exit 0, 10 passed, 0 failed/skipped. Uses fake tools/fixture executables, no product app launch or real notarization.
- Native scoped format: `cargo fmt --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core -p monocode-gpui --check`: exit 0.
- Native full format: same manifest with --all --check: exit 1, BLOCKED by excluded vendor/portable-pty discovering enclosing Cargo workspace. No parent manifest altered.
- Native core: `cargo test --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core --profile native-dev`: exit 101, BLOCKED by uncached alacritty_terminal before compilation. Isolated target directory /private/tmp/molfar-gpui-audit-target.
- Existing upstream fixtures: `./node_modules/.bin/vitest run scripts/upstream`: exit 0; 4 files, 35 tests passed, including rewritten-source refusal and up-to-date behavior. Initial node --test attempt used wrong runner and failed module resolution; corrected to project Vitest runner.
- Initial publication attempt: normal git push stopped by pre-push check because vitest was absent. Hook was not bypassed. Dependencies reused for rerun; final publication status below.
- Initial installed-binary --help probe exited 134 because top-level help is not the CLI namespace; no successful product startup. Source inspection identified `app` prefix; subsequent read used CLI-only code path. No native app was executed.
- Build/types/Clippy/native Rust tests/security dependency audit/coverage/runtime/UI/device/performance: incomplete or skipped, no native readiness claim. Full web pre-push validation and publication verification recorded below when complete.

## Publication and handoff

Assessment-only draft representation explicitly approved. migration/gpui published at ea6c8219 with a normal push from an isolated detached worktree matching native source; applicable hooks remained intact. The native tree contains no repository pre-push hook. The original dirty native worktree/ref stayed unchanged. Direct PR attempt was rejected by automatic approval review as the wrong representation after assessment-only approval; it was not retried. Assessment draft publication pending below. Wisp notification requires supported app access; inactive access prevents finding/sending to its session. This report and preserved evidence are ready for handoff. No private session store was accessed.

## Additional baseline results

Full web check with reused dependencies initially failed under Node 26 WebStorage (164 failed test files / 584 failed tests); disabling experimental WebStorage reduced failures but exposed stale/missing dependency state including zustand (101 failed files / 97 failed tests). These runs do not establish main code regressions. Required hooks were not bypassed. Installed exact lockfile dependencies in this isolated worktree with npm ci --ignore-scripts (exit 0, 490 packages); no production checkout dependency directory modified. No feature fixes included.

## Live repository permissions and dependency audit

GitHub API reports allow_auto_merge=false, default_branch=main, archived=false. Actions enabled=true, allowed_actions=all, sha_pinning_required=false. These are observations, not changed settings; broad allowed actions/unrequired pinning is repository policy context rather than proof of an exploit. Native workflow permissions and publishing scopes are documented above. Exact-lockfile npm audit --audit-level=high exits 0: 4 low, 0 moderate/high/critical. Initial sandbox DNS audit attempt failed and was repeated with authorized network access. Native Rust dependency audit remains skipped due unresolved native dependencies.

## Erik's final scope clarification

The rewrite working branch remains migration/gpui. Merge to main must wait until all required MOLFAR features are ported and parity/readiness gates pass. Erik approved only the assessment draft representation now; it does not replace the eventual code integration PR and does not authorize implementing the entire migration. No duplicated native tree is included.

## Clean validation result

`NODE_OPTIONS=--no-experimental-webstorage npm run --silent check:web` exited 0 after npm ci --ignore-scripts. Vitest: 796 passed files, 2 skipped; 7,123 passed tests, 13 skipped. Command also completed application and browser-test TypeScript checks, lint, file-size, boundaries and move-map gates. This validates the unchanged current-main web baseline, not native functionality. No production app/UI executed. Staged-secret scan and git diff --cached --check exited 0; preserved JSON syntax/hashes and ten unchanged original files verified. No runtime/build/native dependency/coverage claim inferred.

## Verified initial publication

Draft PR https://github.com/deluminor/molfar/pull/124 is OPEN and isDraft=true. Base main@3bb0af0c462761cc0f0e75be7984dc22fb15507f; assessment head molfar/gpui-integration-upstream-audit@6d5e6c16bcef9f10e4ca96d9ca6598b68a6cc9d9. Native working branch migration/gpui remains ea6c8219bae954a3d8a9e8c536242b9531a683f7 on origin. All three live refs verified after publication. Full pre-push check:web hook also exited 0 with 7,123 tests passed / 13 skipped. Published body exactly matches reviewed body and has no attribution byline. CI was pending at verification; no merge readiness inferred.

GitHub push banner separately reports five repository-wide Dependabot alerts (2 high, 2 moderate, 1 low). This is broader than root npm audit (4 low): root audit does NOT certify mobile/Rust/all lockfiles. No unsolicited dependency remediation performed.

After Erik said he would enable /operator, one additional supported habits.list read still returned inactive access (retryable:false). No live new-habit certification or Wisp notification could be completed. Requires actual operator activation, not only a text promise. No fallback to private stores or credentials.
