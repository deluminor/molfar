# GPUI migration tasks

Status: setup/planning authorized; **all implementation tasks below are PROPOSED and NOT STARTED**. `todo init` could not run: no todo executable or exposed task-tracking tool. This file plus `task-status.json` is the durable fallback. Do not install a task tool or mark implementation approved implicitly.

## Authorized setup/planning (R01–R03, R10, R12)

- [x] **S01** — Inspect and fingerprint every existing worktree/head/status/diff/untracked file. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S02** — Verify upstream remote, fetch live GPUI and standard origin refs. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S03** — Create migration/gpui directly at live upstream tip in project-local registered worktree. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S04** — Audit shipped main, remote PR119, local-only hardening and pending PR117 separately. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S05** — Create 22-item native-equivalence and migration inventory with evidence/acceptance. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S06** — Specify isolation, parity, test, manual merge-sync and source-cutover gates. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S07** — Persist spec/plan/tasks/checkpoint and complete report in new worktree. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S08** — Run practical non-UI baseline checks and record actual failures/skips. Status: complete. Files: planning artifacts / scratch evidence only.
- [x] **S09** — Cross-check artifacts and verify preservation of existing content. Status: complete. Files: planning artifacts / scratch evidence only.

Checkpoint: registered branch/head match upstream; only new planning/scratch content exists; preservation report and baseline logs available. G0 environment remediation remains unimplemented.

## Proposed build/sync foundation

- [ ] **G0-BUILD** — Reproduce nested Cargo workspace discovery using `cargo fmt --all`; resolve only the native/vendor build boundary in `vendor/portable-pty/Cargo.toml` or a validated native command/script strategy after approval. Do not modify outer/main `Cargo.toml` or relocate to a forbidden sibling/global worktree. Review before choosing narrow remedy. Then obtain locked native dependencies under approved install scope and run full checks. Covers R04/R10. Checkpoint: full command succeeds in registered project-local worktree, not only scoped fmt.
- [ ] **G1-SYNC** — After approval, add `.github/gpui-upstream-sync.json`, native-line policy documentation and scoped CI checks using existing `.github/workflows/native.yml`/native release owners. Implement checkpoint ancestry/force-push/conflict evidence gates only within approved scope; do not enable scheduled merges or alter old main automation. Covers R09. Checkpoint: synthetic normal/behind/rewritten/squashed-cutover cases stop or advance as specified.

## Proposed vertical feature slices (R-M01–R-M21, R04–R08/R11)

Each slice below has three separately tracked units: characterize, implement approved delta, verify. Native owners are explicit; a proposed path is not an instruction to create every file mechanically. Reuse/extend existing code before adding helpers. No task resumes stopped hardening B7. [P] means eligible for parallel feature work only after listed dependencies stabilize and separate authorization exists.

### G1 / M01 — Branding, app identity, storage and release isolation

Dependencies: G0 build boundary; before any real native startup, scheduler or listener. Requirement: R-M01. Priority: P0.

- [ ] **T-M01-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-gpui/src/main.rs`, `crates/monocode-core/src/desktop_preferences.rs`, `scripts/package-native.mjs`, `scripts/bundle-native-macos.sh`, `crates/monocode-core/src/app_update/mod.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M01-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-gpui/src/main.rs`, `crates/monocode-core/src/desktop_preferences.rs`, `scripts/package-native.mjs`, `scripts/bundle-native-macos.sh`, `crates/monocode-core/src/app_update/mod.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M01-A** — Verify every M01 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Migration app ID, paths, update channel and credentials differ from both production apps on every supported OS. Test default/explicit DB/CLI/packaged modes; missing or corrupt copied data produces recovery state and never production fallback. Hash original fixture sources before/after import; original database, sidecars, preferences and agent files remain unchanged.

### G2 / M02 — Provider, sessions, streaming, tools and remote-host contracts

Dependencies: M01, copied-data schema/provenance map, current capabilities. Requirement: R-M02. Priority: P0.

- [ ] **T-M02-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/provider.rs`, `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/runtime.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-gpui/src/transcript.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M02-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/provider.rs`, `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/runtime.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-gpui/src/transcript.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M02-A** — Verify every M02 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Replay text/reasoning/tool/approval/question/usage/failure/cancel fixtures with matching order and terminal state. Saved history, custom fields, queue ownership and turn provenance survive copied-data reload and round-trip. Stop/account-switch/close during streaming cannot mutate another session or leave a provider child alive; stale responses discarded. Keyboard transcript selection/focus and reader position survive incremental updates; empty/catalog/auth/network errors are distinct.

### G2 / M03 — PTY, terminal, Git and worktrees

Dependencies: M01/M02; Board later consumes these services. Requirement: R-M03. Priority: P0 safety / P1 interaction.

- [ ] **T-M03-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/git.rs`, `crates/monocode-core/src/scm.rs`, `crates/monocode-core/src/scm/shell.rs`, `crates/monocode-core/src/worktree_management.rs`, `crates/monocode-gpui/src/terminal.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M03-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/git.rs`, `crates/monocode-core/src/scm.rs`, `crates/monocode-core/src/scm/shell.rs`, `crates/monocode-core/src/worktree_management.rs`, `crates/monocode-gpui/src/terminal.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M03-A** — Verify every M03 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Environment-poisoned fixture operates only on intended repository; unknown remote rejected. Terminal resize/reconnect/hide/show preserves shell and scrollback; cancel-close preserves job; Unix and Windows tested separately. Worktree deletion makes dirty/unpushed state visible and requires explicit destructive choice; main checkout and retained branch remain intact. Git failures display actionable error instead of incomplete success; keyboard terminal escape/focus works.

### G3 / M04 — Familiar multi-project sessions and identity mapping

Dependencies: M01/M02; preference import, original-ID mapping. Requirement: R-M04. Priority: P0 data / P1 UI.

- [ ] **T-M04-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/mono.rs`, `crates/monocode-core/src/mono/desktop.rs`, `crates/monocode-gpui/src/monos/mod.rs`, `crates/monocode-gpui/src/shell/mono_panes.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M04-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/mono.rs`, `crates/monocode-core/src/mono/desktop.rs`, `crates/monocode-gpui/src/monos/mod.rs`, `crates/monocode-gpui/src/shell/mono_panes.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M04-A** — Verify every M04 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Copied roster order/labels/projects and associated session identity match source; duplicate path aliases collapse consistently. Project removal does not delete Familiar files or conversation; missing project/session stays visible without implicit replacement. Empty/create/remove flows are keyboard operable; project switch does not jump focus or reset draft.

### G3 / M05 — Soul, memory, topic files, redaction and conflict protection

Dependencies: M01/M04 and app authorization M11. Requirement: R-M05. Priority: P0.

- [ ] **T-M05-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/mono/files.rs`, `crates/monocode-core/src/mono/memory.rs`, `crates/monocode-gpui/src/monos/memory_ui.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M05-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/mono/files.rs`, `crates/monocode-core/src/mono/memory.rs`, `crates/monocode-gpui/src/monos/memory_ui.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M05-A** — Verify every M05 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: SOUL/MEMORY/topic/archive fixture bytes preserved; budget applies only to context inclusion. Stale hash, invalid path and concurrent write reject without lost update; missing optional files and corrupt JSON have explicit states. Redaction/search/supersede/archive fixtures match; secrets never enter logs; conflict recovery remains keyboard accessible.

### G3 / M06 — Habits, scheduler, hidden sessions and approval relay

Dependencies: M02/M04/M05/M11/M18; scheduler enablement only after copied-profile review. Requirement: R-M06. Priority: P0 data / P1 execution.

- [ ] **T-M06-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/mono/habits.rs`, `crates/monocode-gpui/src/monos/scheduler.rs`, `crates/monocode-gpui/src/monos/host.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M06-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/mono/habits.rs`, `crates/monocode-gpui/src/monos/scheduler.rs`, `crates/monocode-gpui/src/monos/host.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M06-A** — Verify every M06 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Hourly/daily/weekdays/weekly/DST fixtures match; disabled habits never execute. Concurrent claim yields one run; cancellation/timeout/deny records correct history and cannot relaunch after STOP. Pending approval remains paused; restart cannot duplicate completion/card delivery; empty/invalid schedule UI explains recovery.

### G3 / M07 — Grouped Familiar completion reports

Dependencies: M02/M04/M06/M11 and artifact cards M18. Requirement: R-M07. Priority: P1.

- [ ] **T-M07-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-core/src/mono.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M07-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-core/src/mono.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M07-A** — Verify every M07 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Fast completion before sibling registration still waits; rejected launch excluded; failure/cancel terminal; stale retry ignored. Same session watched by different Familiar/turn does not cross-deliver; dismissal removes only intended result. Baseline parity: one report per accepted batch while owned; busy Familiar queues instead of steering; report navigation preserves scroll/focus. Proposed additional durability criterion, requiring slice approval: restart recovers accepted group metadata without duplicate delivery.

### G4 / M08 — Task Board durable stage engine and recovery

Dependencies: M01/M02/M03/M11/M18; cancellation/settlement contract first. Requirement: R-M08. Priority: P0.

- [ ] **T-M08-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/task_board/ (proposed concern)`, `crates/monocode-gpui/src/task_board/ (proposed views)`, `crates/monocode-core/src/lib.rs`, `crates/monocode-gpui/src/main.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M08-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/task_board/ (proposed concern)`, `crates/monocode-gpui/src/task_board/ (proposed views)`, `crates/monocode-core/src/lib.rs`, `crates/monocode-gpui/src/main.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M08-A** — Verify every M08 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Full fixture flow traverses existing stages; crash at accepted/session_prepared/turn_submitted/settled recovers without double run. Duplicate callback settles once with full final text; unavailable runtime becomes interrupted, never false success. Preserve existing card cancellation and review-gate behavior on reload; cancelled cards cannot silently redispatch. Proposed additional global-pause durability across restart requires slice approval. DB work stays off UI thread; empty/loading/error board states recover explicitly.

### G4 / M09 — Board per-stage models, skills and review gates

Dependencies: M08/M02 and copied Board settings. Requirement: R-M09. Priority: P1.

- [ ] **T-M09-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/task_board/stage_config.rs (proposed)`, `crates/monocode-core/src/task_board/transitions.rs (proposed)`, `crates/monocode-gpui/src/task_board/ (proposed)`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M09-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/task_board/stage_config.rs (proposed)`, `crates/monocode-core/src/task_board/transitions.rs (proposed)`, `crates/monocode-gpui/src/task_board/ (proposed)`; proposed improvement scope remains subject to that approval.
- [ ] **T-M09-A** — Verify every M09 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Override precedence matches source; provider switch clears incompatible fields; existing run provenance remains immutable. Unavailable model blocks launch visibly; missing skills handled explicitly; plan approval and final gate cannot be skipped. Keyboard settings/review controls labeled; empty catalog and stale approval show useful error without dispatch.

### G4 / M10 — Board worktrees, versioned artifacts and file handoff

Dependencies: M03/M08/M09/M18/M11. Requirement: R-M10. Priority: P0 safety / P1 full flow.

- [ ] **T-M10-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/task_board/artifacts.rs (proposed)`, `crates/monocode-core/src/task_board/worktree.rs (proposed)`, `crates/monocode-core/src/task_board/dispatch.rs (proposed)`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M10-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/task_board/artifacts.rs (proposed)`, `crates/monocode-core/src/task_board/worktree.rs (proposed)`, `crates/monocode-core/src/task_board/dispatch.rs (proposed)`; proposed improvement scope remains subject to that approval.
- [ ] **T-M10-A** — Verify every M10 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Main checkout untouched; retained worktree reused without dropping dirty files; missing artifact blocks launch. Selected versions/fingerprints match run receipt; prompt references existing input files, not expanded bodies. Cancel during startup stops newly created session; duplicate delivery rejected; failed handoff retains evidence and offers explicit retry.

### G2 foundational / G4-G5 extensions / M11 — App CLI, connector MCP, action authorization, idempotency and STOP

Dependencies: G2 foundation needs M01/M02 only. Board/artifact/Confluence action extensions are implemented with their owning G4/G5 services M08/M10/M13/M18; those extensions do not block the foundational action boundary. Requirement: R-M11. Priority: P0.

- [ ] **T-M11-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/app_access.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-core/src/mono/bridge.rs`, `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-gpui/src/main.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M11-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/app_access.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-core/src/mono/bridge.rs`, `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-gpui/src/main.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M11-A** — Verify every M11 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Same request+input produces one effect across timeout/restart; reused ID with changed input rejected; mutation and receipt commit together. Denied/out-of-project/stale approval or question call causes zero mutation; unknown action never falls through. STOP pauses control dispatch/queues; paused list/get/wait allowed, no implicit resume; preserve namespace-specific self-session protections. CLI/MCP fixture fields/errors match; cancel/disconnect does not duplicate accepted work.

### G5 / M12 — Jira Inbox hierarchy

Dependencies: M01/M02, account-scoped config; M21 HTTP safeguards. Requirement: R-M12. Priority: P1.

- [ ] **T-M12-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/inbox/jira.rs`, `crates/monocode-gpui/src/inbox/ui.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M12-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/inbox/jira.rs`, `crates/monocode-gpui/src/inbox/ui.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M12-A** — Verify every M12 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Epic/story/subtask, missing/self/cyclic parent and mixed-project fixtures retain every visible issue. Expansion/selection survive refresh; keyboard search/navigation reaches children. Loading/empty/auth/timeout/retry distinct; changed-account response discarded; credentials never follow unsafe redirect.

### G5 / M13 — Confluence browser, context, app actions and connector MCP

Dependencies: M01/M11/M12; shared connector HTTP/error policy. Requirement: R-M13. Priority: P1.

- [ ] **T-M13-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/confluence/ (proposed)`, `crates/monocode-core/src/connectors_mcp/ (proposed)`, `crates/monocode-gpui/src/inbox/ (Confluence views proposed)`, `crates/monocode-gpui/src/main.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M13-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/confluence/ (proposed)`, `crates/monocode-core/src/connectors_mcp/ (proposed)`, `crates/monocode-gpui/src/inbox/ (Confluence views proposed)`, `crates/monocode-gpui/src/main.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M13-A** — Verify every M13 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Nested space/page/folder and pagination fixtures match; missing/unsupported content, invalid token and timeout recover. Context preserves title/body/source URL; cancelled search cannot replace current selection; account disconnect clears cached pages. MCP/action shapes and existing write behavior fixture-tested; credentials excluded from logs; reader/tree keyboard and empty/error states covered.

### G6 / M14 — Obsidian / Knowledge vault, graph and revision editing

Dependencies: M01/M02/M11, native files/editor and artifact-safe assets. Requirement: R-M14. Priority: P1.

- [ ] **T-M14-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/file_editor.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M14-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/file_editor.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M14-A** — Verify every M14 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Two views share one scan; cancel/reconnect rejects stale output; external edit causes revision conflict. No outside-vault read/write; encoded/relative/ambiguous/wiki links match fixtures; missing asset explicit. Large-vault operation remains cancellable; keyboard list/reader and graph alternative available; empty/error/retry paths preserve source files.

### G7 / M15 — Home dashboard and custom brand visuals

Dependencies: M02/M04/M17/M16 and automation summaries. Requirement: R-M15. Priority: P2.

- [ ] **T-M15-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/home/ (proposed aggregation)`, `crates/monocode-gpui/src/home/ (proposed views)`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M15-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/home/ (proposed aggregation)`, `crates/monocode-gpui/src/home/ (proposed views)`; proposed improvement scope remains subject to that approval.
- [ ] **T-M15-A** — Verify every M15 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Copied visible widget set/order retained or explicit recoverable mapping shown; source preference never overwritten on parse failure. Empty/loading/partial/error cards show real state; navigation to session keeps selection. Keyboard rearrange alternative works; all animation obeys reduced motion and hidden-window pause; benchmark before claiming smoother rendering.

### G7 / M16 — Usage dashboard and additional provider sources

Dependencies: M01/M02 and preference mapping; shared usage data precedes independent Home/Usage views. No dependency on M15. Requirement: R-M16. Priority: P1 data / P2 surface.

- [ ] **T-M16-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/usage.rs`, `crates/monocode-core/src/usage/ (extend as needed)`, `crates/monocode-gpui/src/usage_dashboard/ (proposed)`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M16-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/usage.rs`, `crates/monocode-core/src/usage/ (extend as needed)`, `crates/monocode-gpui/src/usage_dashboard/ (proposed)`; proposed improvement scope remains subject to that approval.
- [ ] **T-M16-A** — Verify every M16 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: All four shipped dashboard sources represented or explicit parity blocker recorded. One failed refresh cannot erase other cards; last-good marked stale; missing values never fabricated. Old-account response ignored; retry/cancellation/empty/limited states correct; chart meaning available without color/hover.

### G2 import / G7 polish / M17 — Custom settings, themes and saved defaults

Dependencies: M01/M02; copied web-storage export. Requirement: R-M17. Priority: P0 import / P2 polish.

- [ ] **T-M17-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/desktop_preferences.rs`, `crates/monocode-gpui/src/settings/model.rs`, `crates/monocode-gpui/src/theme.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M17-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/desktop_preferences.rs`, `crates/monocode-gpui/src/settings/model.rs`, `crates/monocode-gpui/src/theme.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M17-A** — Verify every M17 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Explicit true/false/value imports match source and survive reload; missing and invalid values distinguished. Unsupported keys retained in import manifest; no production storage access; failed write surfaced. Settings search/keyboard/focus/reduced motion and high-contrast states verified later; absent defaults approved before adoption.

### G2 storage/security / G4 Board integration / M18 — Document and HTML artifacts, cards and sandbox security

Dependencies: M01/M02/M11 and platform HTML implementation before required-platform parity. Requirement: R-M18. Priority: P0 security / P1 parity.

- [ ] **T-M18-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/store/notes.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-gpui/src/monos/html.rs`, `crates/monocode-gpui/src/monos/cards.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M18-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/store/notes.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-gpui/src/monos/html.rs`, `crates/monocode-gpui/src/monos/cards.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M18-A** — Verify every M18 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Stable IDs/provenance survive reopen; retry updates one card; delete removes intended reference. Malicious HTML cannot call app bridge, fetch network or access parent DOM; opener/height messages validated. Keyboard focus can enter/exit; missing/corrupt content recoverable; required-platform HTML rendering or explicit approved scope waiver before release.

### G8 / M19 — Companion HTTP/Tailscale gateway and BitChain compatibility

Dependencies: M01/M02/M04-M11/M14 and M21 validation/config-corruption safeguards. Requirement: R-M19. Priority: P1.

- [ ] **T-M19-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/companion/ (proposed)`, `crates/monocode-gpui/src/settings/ (Companion settings proposed)`, `crates/monocode-gpui/src/shell.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M19-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/companion/ (proposed)`, `crates/monocode-gpui/src/settings/ (Companion settings proposed)`, `crates/monocode-gpui/src/shell.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M19-A** — Verify every M19 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Companion v2 fixtures retain all shipped custom methods; revoked devices denied and secrets not logged. STOP works while views hidden; stale/replayed approvals rejected; conflicts preserve vault/Board data. Corrupt pairing store backed up with visible error; default-off/no wildcard behavior retained; pairing/cancel/offline UI accessible. External BitChain client interoperability remains a later runtime gate, not inferred from server tests.

### G1 policy / G8 client / M20 — Pending QUIC phone app and mandatory no-UPnP policy

Dependencies: M01 first; M11 domain layer; custom phone capabilities depend on migrated services; mobile distribution remains separate approval. Requirement: R-M20. Priority: P0 no-router policy / P2 client.

- [ ] **T-M20-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/mobile/host.rs`, `crates/monocode-core/src/mobile/router.rs`, `crates/monocode-core/Cargo.toml`, `crates/monocode-gpui/Cargo.lock`, `mobile/app.json`, `mobile/src/features/connection/nativeLink.ts`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M20-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/mobile/host.rs`, `crates/monocode-core/src/mobile/router.rs`, `crates/monocode-core/Cargo.toml`, `crates/monocode-gpui/Cargo.lock`, `mobile/app.json`, `mobile/src/features/connection/nativeLink.ts`; proposed improvement scope remains subject to that approval.
- [ ] **T-M20-A** — Verify every M20 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Default/config/legacy fixtures never invoke router mapping; dependency/lockfile/source guard rejects igd-next/natpmp mapping restoration. Pair/revoke/reconnect/watch/STOP fixtures preserve native behavior; no listeners start by importing data. Pending client labeled candidate until devices/platform distribution tested; no EAS build/publish or account changes in setup.

### G1-G2 then each owning slice / M21 — Lifecycle, persistence, validation and hardening invariants

Dependencies: All slices; M01 before runtime and M02 persistence boundary. Requirement: R-M21. Priority: P0 invariants / P2 cleanup.

- [ ] **T-M21-F** — Characterize source/native difference with deterministic contract/data/failure fixtures adjacent to `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/workspace.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-core/src/mcp.rs`, `crates/monocode-core/src/remote.rs`; use source evidence and acceptance in `inventory.json`. No live data.
- [ ] **T-M21-I** — After slice approval, reuse native equivalent and implement only evidenced delta in `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/workspace.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-core/src/mcp.rs`, `crates/monocode-core/src/remote.rs`; proposed improvement scope remains subject to that approval.
- [ ] **T-M21-A** — Verify every M21 acceptance item against those owners and adjacent tests; record command/revision/platform/fixture in `docs/specs/gpui-migration/parity-results.md` (proposed). GUI/device cases stay SKIPPED until separately authorized.

Checkpoint: Snapshot load failure never overwrites unread stored layout; explicit successful recovery resumes writes. Partial boot writes report each failure; corrupt settings retain backup; malformed phone input has zero side effects. MCP failure is visible; inherited Git env cannot redirect repository; source-specific mutex recovery does not hide invalid state. Native regression reproduces relevant failure then passes fix; local-only UI changes remain evidence, not resumed B7.

## G9 — release/parity/sync acceptance

- [ ] **G9-PARITY** — Populate `docs/specs/gpui-migration/parity-results.md` for M01–M21, copied-data round-trip/recovery and pending hardening dispositions; no skipped required behavior treated as pass. Targets: migrated core/view tests, importer manifest and acceptance register. Covers R06/R11.
- [ ] **G9-PERF** — Add/reuse deterministic native fixtures in `crates/monocode-gpui/src/fixtures.rs` and focused measurement harness only as necessary; record hardware/workload/startup/input/frame/memory/CPU/package results in planning evidence. Set budgets after baseline approval. Covers R07/R11.
- [ ] **G9-PLATFORM** — Verify supported OS/architecture packaging/runtime/accessibility/IME/HTML/media/notifications and phone/BitChain interoperability after explicit runtime QA authorization. Targets: `.github/workflows/native.yml`, `.github/workflows/native-release.yml`, native platform owners and `mobile/` tests if changed. Covers R11. Compile-only evidence is insufficient.
- [ ] **G9-SYNC** — Rehearse manual merge/force-push/source-cutover procedure and validate scoped future history/release-policy transition before promotion. Targets: `.github/gpui-upstream-sync.json`, native policy/tests, existing history guard only in an explicitly approved later cutover change. Covers R09.
- [ ] **G9-RELEASE** — Present full parity evidence, unresolved gaps/waivers and rollback procedure; obtain separate promotion/publication approval. No push, PR, main merge or release inferred. Targets: parity report, packaging identity/feed/tests and release checklist. Covers R11/R12.

Checkpoint: Erik accepts required behavior/platforms and rollback evidence. Main promotion and source transition remain explicit operations.

## M22 — backlog boundary, no implementation task

Board card dependencies, Companion full-text vault search/push, deferred global-refactor Stages6–10 and unrelated redesigns are not migrated as shipped features. Add a separate spec/task set only if explicitly approved. R-M22 is satisfied by accurate classification, not by implementing wishlist items.
