# GPUI migration setup and MOLFAR feature inventory

Date: 26 October 2026. Status: **setup executed; migration direction approved; detailed feature implementation NOT approved**.

Erik selected the upstream-native direction after the earlier architecture assessment. This report carries out the requested local branch/worktree setup and prepares the feature-by-feature migration plan. The earlier recommendation to retain React/Tauri is not treated as binding. No feature has been implemented, no existing checkout switched, and stopped hardening B7 has not been resumed.

## Setup result and exact source snapshots

- **New branch:** `migration/gpui`.
- **Registered worktree:** `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar/.worktrees/gpui-migration`.
- **Branch HEAD / fetched live upstream GPUI tip:** `ea6c8219bae954a3d8a9e8c536242b9531a683f7`.
- **Verified remote:** `upstream` = `git@github.com:hardbeat920/monocode.git`; source `mc/migrate-monocode-to-gpui`.
- **Live upstream main at fetch:** `26465c620977f3951d0a532a0f7db32c3c179007`.
- **Observed remote metadata:** 2026-10-26T21:49:02Z. These are pinned research/setup snapshots, not a promise that remote branches cannot advance later.
- **MOLFAR shipped-source main:** `4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0` (PR108 architecture work present).
- **Open PR119 published head:** `cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5`; base `4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0`.
- **PR119 local branch/worktree head:** `9e4eb4538be7c7bddf2dcafbf83c963a91100f07`; six additional local-only commits, not assumed published or merged.
- **Open PR117 sync/mobile head:** `02b66c63bc9c2a69a91e326ab4b5e4a390de5762`; phone/Expo branding and no-router-mapping changes are pending, not shipped main.
- **Previous content-patch upstream checkpoint:** `e53e09aad2f19663cae364266383eb6c251e0811`.

The branch was created directly at the immutable upstream tip using registered `git worktree add --no-track -b migration/gpui`, not from MOLFAR main. No exposed app `worktrees.create` capability was available, so the user-authorized Git fallback was used. Remotes were not changed. Standard origin fetch refreshed remote-tracking metadata only.

The native worktree's current tracked tree remains identical to upstream. Planning files under `docs/specs/gpui-migration/` are new and uncommitted; scratch reports/logs are ignored by upstream's existing ignore policy. Parent main now sees a new `?? .worktrees/` infrastructure entry because the worktree is intentionally nested. No parent ignore/exclude file or tracked main source was edited.

## Preservation verification

All 9 pre-existing worktrees retained their HEAD and content. Verification compared complete tracked binary diffs/status plus SHA-256 of existing untracked files. The dirty `/private/tmp/molfar-pre-b7` backup retained its baseline changes and extraction script. PR119 local worktree and every other checkout were left in place. The new worktree has no tracked diff against upstream HEAD.

Evidence: `scratch/setup-verification.json`, `scratch/source-snapshot.json`. No commit, push, PR creation, merge into main, existing worktree reset/removal, app/GUI launch, dependency installation, production-data access, automation/habit change or B7 continuation occurred.

## How the inventory was established

Reused the existing report at `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar/scratch/monocode-gpui-assessment-2026-10-26.md`, then inspected current code and refs again. Compared shipped MOLFAR content to its recorded upstream content checkpoint, checked pending PR119 remote/local commits separately, checked pending PR117 mobile policy, and mapped them to actual native core/GPUI code. Raw manifests are in `scratch/shipped-content-delta.txt`, `scratch/pr119-remote-commits.txt`, `scratch/pr119-local-only-commits.txt`, and `scratch/pending-sync117-commits.txt`. Rename detection used a per-command higher limit; no Git config was changed. Changed-path counts alone are not a feature inventory because React reorganization and branding create many moves.

Source keys below: **M** shipped main; **H** published pending PR119; **L** local-only hardening head; **S** pending PR117; **U** upstream native. Local-only commits use Git-object locators rather than pretending GitHub already publishes them. One ignored original Board spec is explicitly captured as unversioned planning evidence; shipped Board types also establish the absence of card-dependency fields. All 88 cited source paths/line ranges were mechanically checked; this validates locators, not runtime correctness.

## Corrections that govern migration scope

1. Multi-project Familiar/Mono identity, soul/memory/habits, grouped completions, ordinary artifacts and many display settings already have substantial native equivalents. Reuse them and reconcile only MOLFAR-specific keys/data/policy.
2. Durable Task Board, Confluence, Knowledge vault, Home grid, extended Usage sources and Companion/custom action contracts contain meaningful MOLFAR deltas.
3. Jira connector is common; Jira hierarchy is a custom delta that native upstream lacks.
4. Board card dependencies are backlog. Native orchestrator task dependencies are a different concept. Do not advertise a Board dependency feature as shipped.
5. Shipped phone capability is Companion HTTP/Tailscale v2. QUIC phone client/Expo integration remains pending PR117. Both contracts need explicit treatment; one cannot replace the other silently.
6. No automatic router mapping is a mandatory product/security decision. Pending MOLFAR commit `118b5c1a89ab2737285bad00acaf0d3aa44355b6` removes it, while native upstream still defaults `open_router` to true and depends on mapping libraries. Carry removal/guards before any native runtime; changing only the default is insufficient.
7. Completion groups surviving restart and global Board-engine pause surviving restart are additional proposed durability improvements. The shipped TS batch Map/Set and engine stop flag are in-memory. Preserve existing behavior without rewriting history about what shipped.

## Native base retained rather than reimplemented

The native branch already includes provider transports/events, account switching, storage, Mono projects/files/habits, Git/worktrees, Alacritty terminal, editor/markdown, settings, Inbox connectors, mobile QUIC and a separate Node remote host. Three examples from the inspected baseline are in-place idle account transfer (`5fda02dd846f53d842117a4de007f51268d487b8`), Mono split panes (`9d1ff62299267dc44006926ecc60a866ae96ffc9`) and preserving the last panel terminal (`34e0028d6a69f666ad0d45380615f8806d0b779c`). They are already present in the new worktree; no React version needs to be ported back over them. Unix foreground-stop implementation does not establish Windows parity.

Rust is retained; native core has no Tauri/GPUI dependency, GPUI owns native views, and existing React/Tauri remains a parallel upstream implementation. QuickJS editor assets, macOS HTML WKWebView, external provider CLIs and Node remote hosting remain runtime/build considerations. GPUI adoption is not a guarantee of removing all JavaScript/webviews or of improving performance.

## Baseline checks performed without GUI or installation

Toolchain: rustc 1.98.1, cargo 1.98.1, Node 26.8.1.

| Check | Exit | Result |
|---|---|---|
| `node --test scripts/native-release.test.mjs scripts/package-native.test.mjs` | 0 | **PASS** — 10 tests passed, 0 failed, 0 skipped; fake packaging tools and temporary fixture executable, not application launch |
| `cargo fmt --manifest-path crates/monocode-gpui/Cargo.toml --all --check` | 1 | **BLOCKED** — Excluded vendor/portable-pty is discovered under outer MOLFAR Cargo workspace in nested worktree; no source modification attempted |
| `cargo fmt --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core -p monocode-gpui --check` | 0 | **PASS** — Scoped native packages format check passes; does not replace full --all check |
| `CARGO_TARGET_DIR="$PWD/scratch/cargo-target" cargo test --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core --profile native-dev` | 101 | **BLOCKED** — Dependency resolution cannot find cached alacritty_terminal; compilation/tests did not execute |
| `native build, Clippy, GPUI tests, production TS/host suites, security dependency audit, GUI/mobile/device/performance checks` | not run | **SKIPPED** — No dependencies installed; full Cargo boundary and offline dependency blockers; no feature change; GUI/mobile/app explicitly not authorized in this session |

Logs are stored in scratch/baseline-*.log. Packaging tests used fake tools and a temporary fixture executable; they did not launch MonoCode or MOLFAR or contact Apple's real notarization service.

The full rustfmt command failed before formatting because excluded `vendor/portable-pty` discovers the outer MOLFAR Cargo workspace from this required nested location. The scoped check passes, but does not erase the full-command blocker. Offline core tests stopped in dependency resolution because `alacritty_terminal` was not cached; no compilation or Rust tests ran. A narrow native build-boundary remedy and approved locked dependency setup are first implementation prerequisites. Do not fix this by editing parent main or moving to an unauthorized sibling/global worktree.

No claim is made that the native app builds, runs, performs better, migrates data correctly or has cross-platform parity on this machine. Prior upstream CI success is historical evidence in the assessment, not a substitute for these current local results.

## Feature inventory overview

Every entry below has source evidence, native equivalent, unique delta, portability, dependencies, risk, proposed improvement and observable acceptance. P0 means prerequisite/data/security safety; P1 means core functional parity; P2 means later product surface or candidate work. These priorities do not authorize implementation.

| ID | Feature | Status | Order / priority |
|---|---|---|---|
| M01 | Branding, app identity, storage and release isolation | Shipped identity; native isolation not implemented | G1 / P0 |
| M02 | Provider, sessions, streaming, tools and remote-host contracts | Common native functionality with shipped MOLFAR extensions | G2 / P0 |
| M03 | PTY, terminal, Git and worktrees | Common native capability; pending hardening policies | G2 / P0 safety / P1 interaction |
| M04 | Familiar multi-project sessions and identity mapping | Shipped; substantial common native equivalent | G3 / P0 data / P1 UI |
| M05 | Soul, memory, topic files, redaction and conflict protection | Shipped; mostly common native equivalent | G3 / P0 |
| M06 | Habits, scheduler, hidden sessions and approval relay | Shipped; native equivalent needs behavioral reconciliation | G3 / P0 data / P1 execution |
| M07 | Grouped Familiar completion reports | Shipped; common feature with different algorithms | G3 / P1 |
| M08 | Task Board durable stage engine and recovery | Shipped MOLFAR-specific functionality | G4 / P0 |
| M09 | Board per-stage models, skills and review gates | Shipped MOLFAR-specific policy | G4 / P1 |
| M10 | Board worktrees, versioned artifacts and file handoff | Shipped MOLFAR-specific workflow | G4 / P0 safety / P1 full flow |
| M11 | App CLI, connector MCP, action authorization, idempotency and STOP | Shipped base plus pending hardening; native common actions | G2 foundational / G4-G5 extensions / P0 |
| M12 | Jira Inbox hierarchy | Shipped custom hierarchy over common connector | G5 / P1 |
| M13 | Confluence browser, context, app actions and connector MCP | Shipped MOLFAR-specific integration | G5 / P1 |
| M14 | Obsidian / Knowledge vault, graph and revision editing | Shipped MOLFAR-specific integration | G6 / P1 |
| M15 | Home dashboard and custom brand visuals | Shipped MOLFAR-specific surface | G7 / P2 |
| M16 | Usage dashboard and additional provider sources | Shipped custom dashboard over common usage data | G7 / P1 data / P2 surface |
| M17 | Custom settings, themes and saved defaults | Shipped; many controls already common native | G2 import / G7 polish / P0 import / P2 polish |
| M18 | Document and HTML artifacts, cards and sandbox security | Shipped; common native artifact base plus MOLFAR metadata | G2 storage/security / G4 Board integration / P0 security / P1 parity |
| M19 | Companion HTTP/Tailscale gateway and BitChain compatibility | Shipped gateway; pending PR119 hardening | G8 / P1 |
| M20 | Pending QUIC phone app and mandatory no-UPnP policy | Pending PR117 mobile candidate; security decision mandatory | G1 policy / G8 client / P0 no-router policy / P2 client |
| M21 | Lifecycle, persistence, validation and hardening invariants | Pending PR119 remote; six additional local-only commits | G1-G2 then each owning slice / P0 invariants / P2 cleanup |
| M22 | Backlog and optional improvements boundary | Not shipped parity: separate proposals only | After G9; separate feature approval / Deferred |

## Detailed feature records

### M01 — Branding, app identity, storage and release isolation

**Status:** Shipped identity; native isolation not implemented. **Priority:** P0. **Order:** G1.

**Source evidence:** [M: `src-tauri/tauri.conf.json`:3–5](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/tauri.conf.json#L3-L5); [M: `src-tauri/src/app_identity.rs`:1–38](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/app_identity.rs#L1-L38); [M: `src-tauri/src/session_store.rs`:1–20](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/session_store.rs#L1-L20); [U: `crates/monocode-gpui/src/main.rs`:225–274](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/main.rs#L225-L274); [U: `scripts/package-native.mjs`:100–115](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/scripts/package-native.mjs#L100-L115).

**Native equivalent:** Native startup, packaging, update and desktop-preference services exist, but use MonoCode identity and production-data defaults.

**Unique MOLFAR delta:** MOLFAR names/assets, app IDs, molfar.db, configuration namespaces, protocols, notification/keyring identity, CLI credentials and independent update feed. Migration identity must also differ from current production MOLFAR.

**Portability:** Adapt existing native identity/startup/packaging; preserve historical identifiers only inside explicit import mappings. Do not globally rename the dependency tree or wire contracts.

**Dependencies:** G0 build boundary; before any real native startup, scheduler or listener.

**Risks:** An explicit database override alone does not isolate preferences, tokens, roster, logs, notifications or updater. Release defaults can select installed MonoCode data.

**Suggested improvement — proposal:** Propose one explicit migration identity/data policy and fail-closed startup path validation; disable installed-profile auto-discovery, schedulers and network listeners for migration profiles.

**Observable acceptance criteria:**

- Migration app ID, paths, update channel and credentials differ from both production apps on every supported OS.
- Test default/explicit DB/CLI/packaged modes; missing or corrupt copied data produces recovery state and never production fallback.
- Hash original fixture sources before/after import; original database, sidecars, preferences and agent files remain unchanged.

**Expected native owners:** `crates/monocode-gpui/src/main.rs`, `crates/monocode-core/src/desktop_preferences.rs`, `scripts/package-native.mjs`, `scripts/bundle-native-macos.sh`, `crates/monocode-core/src/app_update/mod.rs`.

### M02 — Provider, sessions, streaming, tools and remote-host contracts

**Status:** Common native functionality with shipped MOLFAR extensions. **Priority:** P0. **Order:** G2.

**Source evidence:** [M: `src/integrations/harness/core/types.ts`:9–177](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/integrations/harness/core/types.ts#L9-L177); [M: `src/features/sessions/data/session-store.ts`:40–93](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/sessions/data/session-store.ts#L40-L93); [M: `host/providers.ts`:1–50](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/host/providers.ts#L1-L50); [U: `crates/monocode-core/src/provider.rs`:60–125](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/provider.rs#L60-L125); [U: `crates/monocode-gpui/src/runtime/persistence.rs`:1–106](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/runtime/persistence.rs#L1-L106).

**Native equivalent:** Eleven provider transports, normalized native events, accounts, worker runtime, transcript and store already exist; Node remote host remains separate.

**Unique MOLFAR delta:** MOLFAR custom session/card/Familiar/worktree metadata, queued-message policies, app access and pending hardening invariants. Provider selection/catalog/ordinary chat are common, not new features.

**Portability:** Prefer native transports/reducers and reuse TS tests as protocol fixtures; explicitly map string session IDs to native handles without losing original durable identity. Keep host wire compatibility; no wholesale JS sidecar proposed.

**Dependencies:** M01, copied-data schema/provenance map, current capabilities.

**Risks:** Different row/block representations; stale callbacks/account switch results; unsupported provider capability silently dropped; transient failure interpreted as empty history.

**Suggested improvement — proposal:** Propose compact state updates and worker IO using existing native runtime; stable row IDs, scroll anchors and explicit unavailable/auth/retry states. Measure fixed workloads before claiming a speed gain.

**Observable acceptance criteria:**

- Replay text/reasoning/tool/approval/question/usage/failure/cancel fixtures with matching order and terminal state.
- Saved history, custom fields, queue ownership and turn provenance survive copied-data reload and round-trip.
- Stop/account-switch/close during streaming cannot mutate another session or leave a provider child alive; stale responses discarded.
- Keyboard transcript selection/focus and reader position survive incremental updates; empty/catalog/auth/network errors are distinct.

**Expected native owners:** `crates/monocode-core/src/provider.rs`, `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/runtime.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-gpui/src/transcript.rs`.

### M03 — PTY, terminal, Git and worktrees

**Status:** Common native capability; pending hardening policies. **Priority:** P0 safety / P1 interaction. **Order:** G2.

**Source evidence:** [M: `src/platform/tauri/pty.ts`:1–25](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/platform/tauri/pty.ts#L1-L25); [H: `src-tauri/src/git/command.rs`:1–84](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src-tauri/src/git/command.rs#L1-L84); [U: `crates/monocode-gpui/src/terminal.rs`:363–375](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/terminal.rs#L363-L375); [U: `crates/monocode-core/src/worktree_management.rs`:35–62](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/worktree_management.rs#L35-L62).

**Native equivalent:** Native Alacritty terminal, Git/SCM and worktree services already implemented, including last-panel terminal preservation.

**Unique MOLFAR delta:** Reconcile MOLFAR PTY ownership/replay budgets and Git environment hardening, remote validation and safe deletion/retained-worktree policy. xterm UI is not a portability target.

**Portability:** Adapt small Rust algorithms and contracts into native owners. Transfer hardening regression cases rather than Tauri wrappers or directory splits.

**Dependencies:** M01/M02; Board later consumes these services.

**Risks:** Inherited GIT_DIR/GIT_WORK_TREE redirects commands; delete/force-remove risks uncommitted work; Unix foreground signaling does not prove Windows stop behavior.

**Suggested improvement — proposal:** Propose stable terminal entity ownership, clear job-versus-shell close choices and bounded replay; one explicit repository command policy where existing code needs it.

**Observable acceptance criteria:**

- Environment-poisoned fixture operates only on intended repository; unknown remote rejected.
- Terminal resize/reconnect/hide/show preserves shell and scrollback; cancel-close preserves job; Unix and Windows tested separately.
- Worktree deletion makes dirty/unpushed state visible and requires explicit destructive choice; main checkout and retained branch remain intact.
- Git failures display actionable error instead of incomplete success; keyboard terminal escape/focus works.

**Expected native owners:** `crates/monocode-core/src/git.rs`, `crates/monocode-core/src/scm.rs`, `crates/monocode-core/src/scm/shell.rs`, `crates/monocode-core/src/worktree_management.rs`, `crates/monocode-gpui/src/terminal.rs`.

### M04 — Familiar multi-project sessions and identity mapping

**Status:** Shipped; substantial common native equivalent. **Priority:** P0 data / P1 UI. **Order:** G3.

**Source evidence:** [M: `src/features/familiars/model/familiar.ts`:27–57](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar.ts#L27-L57); [M: `src/features/familiars/model/familiar.ts`:283–329](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar.ts#L283-L329); [U: `crates/monocode-core/src/mono.rs`:35–61](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mono.rs#L35-L61).

**Native equivalent:** Native Mono roster already has projects, session association, sidebar flags, documents, launches, outbox and pending reports; native Mono split panes already exist.

**Unique MOLFAR delta:** MOLFAR Familiar presentation, roster key molfar:familiar-roster, directories, saved IDs and project/path policy. Multi-project support itself is not uniquely ours.

**Portability:** Reuse native Mono model and views; add explicit copied-roster/session mapping and focused policy adaptations. Do not port React overlay design over native split panes.

**Dependencies:** M01/M02; preference import, original-ID mapping.

**Risks:** Duplicate Familiar, missing associations silently opening a new session, removed project deleting persistent context.

**Suggested improvement — proposal:** Propose visible unavailable-association repair, stable focus/selection and accessible project chips using native controls.

**Observable acceptance criteria:**

- Copied roster order/labels/projects and associated session identity match source; duplicate path aliases collapse consistently.
- Project removal does not delete Familiar files or conversation; missing project/session stays visible without implicit replacement.
- Empty/create/remove flows are keyboard operable; project switch does not jump focus or reset draft.

**Expected native owners:** `crates/monocode-core/src/mono.rs`, `crates/monocode-core/src/mono/desktop.rs`, `crates/monocode-gpui/src/monos/mod.rs`, `crates/monocode-gpui/src/shell/mono_panes.rs`.

### M05 — Soul, memory, topic files, redaction and conflict protection

**Status:** Shipped; mostly common native equivalent. **Priority:** P0. **Order:** G3.

**Source evidence:** [M: `src/features/familiars/model/familiar-files.ts`:13–50](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar-files.ts#L13-L50); [M: `src-tauri/src/familiar.rs`:87–102](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/familiar.rs#L87-L102); [M: `src-tauri/src/familiar.rs`:277–299](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/familiar.rs#L277-L299); [U: `crates/monocode-core/src/mono/memory.rs`:1–74](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mono/memory.rs#L1-L74).

**Native equivalent:** Native files/memory services already implement app-owned files, locking, dated entries, redaction and 200-line/24KiB prompt budget.

**Unique MOLFAR delta:** Map familiars versus monos storage, exact existing file content, history/archive/search and MOLFAR scope policies. Markdown and JSON formats are portable.

**Portability:** Reuse native file/memory services after fixture reconciliation; import copied files with explicit manifest; no automatic production adoption.

**Dependencies:** M01/M04 and app authorization M11.

**Risks:** Lost updates, path escape, redaction mismatch, truncating durable files to prompt budget.

**Suggested improvement — proposal:** Propose conflict UI that preserves unsaved text and offers explicit compare/reload; separate prompt truncation from durable storage.

**Observable acceptance criteria:**

- SOUL/MEMORY/topic/archive fixture bytes preserved; budget applies only to context inclusion.
- Stale hash, invalid path and concurrent write reject without lost update; missing optional files and corrupt JSON have explicit states.
- Redaction/search/supersede/archive fixtures match; secrets never enter logs; conflict recovery remains keyboard accessible.

**Expected native owners:** `crates/monocode-core/src/mono/files.rs`, `crates/monocode-core/src/mono/memory.rs`, `crates/monocode-gpui/src/monos/memory_ui.rs`.

### M06 — Habits, scheduler, hidden sessions and approval relay

**Status:** Shipped; native equivalent needs behavioral reconciliation. **Priority:** P0 data / P1 execution. **Order:** G3.

**Source evidence:** [M: `src/features/familiars/model/familiar-habits.ts`:160–193](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar-habits.ts#L160-L193); [M: `src/app/workspace/flows/familiars/habit-host.ts`:24–77](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/app/workspace/flows/familiars/habit-host.ts#L24-L77); [U: `crates/monocode-core/src/mono/habits.rs`:1–80](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mono/habits.rs#L1-L80).

**Native equivalent:** Native habit schedule/claim/history policy and GPUI scheduler already exist.

**Unique MOLFAR delta:** Confirm MOLFAR timeout, no-duplicate claim, hidden-session launch, approval relay and artifact/report delivery semantics against native implementation.

**Portability:** Reuse native scheduler; port only differing policy and test fixtures, not React effects.

**Dependencies:** M02/M04/M05/M11/M18; scheduler enablement only after copied-profile review.

**Risks:** Imported schedule runs unexpectedly; two owners execute same claim; stale approval resumes stopped task.

**Suggested improvement — proposal:** Propose paused imported schedules for migration testing, explicit next-run/timezone/status and recoverable failure history.

**Observable acceptance criteria:**

- Hourly/daily/weekdays/weekly/DST fixtures match; disabled habits never execute.
- Concurrent claim yields one run; cancellation/timeout/deny records correct history and cannot relaunch after STOP.
- Pending approval remains paused; restart cannot duplicate completion/card delivery; empty/invalid schedule UI explains recovery.

**Expected native owners:** `crates/monocode-core/src/mono/habits.rs`, `crates/monocode-gpui/src/monos/scheduler.rs`, `crates/monocode-gpui/src/monos/host.rs`.

### M07 — Grouped Familiar completion reports

**Status:** Shipped; common feature with different algorithms. **Priority:** P1. **Order:** G3.

**Source evidence:** [M: `src/features/familiars/model/familiar-session-completion.ts`:131–245](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar-session-completion.ts#L131-L245); [M: `src/features/familiars/model/familiar-completion-batches.test.ts`:34–116](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar-completion-batches.test.ts#L34-L116); [U: `crates/monocode-gpui/src/monos/host.rs`:791–876](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/monos/host.rs#L791-L876).

**Native equivalent:** Native host already groups launches by origin_turn and waits before reporting.

**Unique MOLFAR delta:** MOLFAR accepted/rejected launch, settlement callback, stale retry, dismissal and per-Familiar/turn batching guarantees need explicit comparison.

**Portability:** Reuse native completion mechanism; port missing invariants as focused native regressions.

**Dependencies:** M02/M04/M06/M11 and artifact cards M18.

**Risks:** Fast child causes early partial report; later source turn receives old report; duplicate/stale callbacks or busy Familiar cause unintended steering.

**Suggested improvement — proposal:** Propose one stable consolidated report/card, queued while busy, preserving reader position and all child outcomes. Durable completion-group recovery after restart is an additional proposal; shipped TS batching is in-memory.

**Observable acceptance criteria:**

- Fast completion before sibling registration still waits; rejected launch excluded; failure/cancel terminal; stale retry ignored.
- Same session watched by different Familiar/turn does not cross-deliver; dismissal removes only intended result.
- Baseline parity: one report per accepted batch while owned; busy Familiar queues instead of steering; report navigation preserves scroll/focus. Proposed additional durability criterion, requiring slice approval: restart recovers accepted group metadata without duplicate delivery.

**Expected native owners:** `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-core/src/mono.rs`.

### M08 — Task Board durable stage engine and recovery

**Status:** Shipped MOLFAR-specific functionality. **Priority:** P0. **Order:** G4.

**Source evidence:** [M: `src/features/task-board/services/engine.ts`:10–66](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/engine.ts#L10-L66); [M: `src/features/task-board/services/ports.ts`:25–66](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/ports.ts#L25-L66); [M: `src-tauri/src/task_board/schema.rs`:1–67](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/task_board/schema.rs#L1-L67); [U: `crates/monocode-core/src/orchestration.rs`:48–66](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/orchestration.rs#L48-L66).

**Native equivalent:** Native orchestration handles scoped dependency plans; no equivalent durable Board engine/store found.

**Unique MOLFAR delta:** Persisted cards/runs/settings, serialized claims, dispatch receipts, reconciliation, hidden card sessions and exactly-once settlement.

**Portability:** Reuse Rust schema/DB routines after version checks; port TS state machine into a focused core Board service with injected session/git/time/store boundaries. Native UI observes committed state.

**Dependencies:** M01/M02/M03/M11/M18; cancellation/settlement contract first.

**Risks:** Double dispatch after crash, lost final text after detachment, queued task restarting after user STOP, stale live claim.

**Suggested improvement — proposal:** Propose durable transition receipts and event-driven projections; visible interrupted/needs-input states instead of optimistic success. Persisting a global engine pause across restart is an additional proposal; shipped engine STOP uses an in-memory flag.

**Observable acceptance criteria:**

- Full fixture flow traverses existing stages; crash at accepted/session_prepared/turn_submitted/settled recovers without double run.
- Duplicate callback settles once with full final text; unavailable runtime becomes interrupted, never false success.
- Preserve existing card cancellation and review-gate behavior on reload; cancelled cards cannot silently redispatch. Proposed additional global-pause durability across restart requires slice approval. DB work stays off UI thread; empty/loading/error board states recover explicitly.

**Expected native owners:** `crates/monocode-core/src/task_board/ (proposed concern)`, `crates/monocode-gpui/src/task_board/ (proposed views)`, `crates/monocode-core/src/lib.rs`, `crates/monocode-gpui/src/main.rs`.

### M09 — Board per-stage models, skills and review gates

**Status:** Shipped MOLFAR-specific policy. **Priority:** P1. **Order:** G4.

**Source evidence:** [M: `src/features/task-board/types/stage.ts`:4–40](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/types/stage.ts#L4-L40); [M: `src/features/task-board/types/settings.ts`:4–14](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/types/settings.ts#L4-L14); [M: `src/features/task-board/model/stage-config.ts`:50–74](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/model/stage-config.ts#L50-L74); [M: `src/features/task-board/model/transitions.ts`:103–129](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/model/transitions.ts#L103-L129).

**Native equivalent:** Native model/catalog/skill and approval controls exist, but no Board column/stage inheritance policy or Board review gates.

**Unique MOLFAR delta:** Per-stage overrides and column defaults, frozen run provenance, explicit plan/final gates and existing legal transition policy.

**Portability:** Reuse native catalog/capabilities; port resolution and transition rules with fixtures into Board domain. Do not duplicate provider model controls.

**Dependencies:** M08/M02 and copied Board settings.

**Risks:** Old model ID silently substituted; incompatible effort survives provider change; editing defaults changes historical provenance; gate bypass.

**Suggested improvement — proposal:** Propose clear inherited/overridden/effective setting display and actionable missing-model/skill states.

**Observable acceptance criteria:**

- Override precedence matches source; provider switch clears incompatible fields; existing run provenance remains immutable.
- Unavailable model blocks launch visibly; missing skills handled explicitly; plan approval and final gate cannot be skipped.
- Keyboard settings/review controls labeled; empty catalog and stale approval show useful error without dispatch.

**Expected native owners:** `crates/monocode-core/src/task_board/stage_config.rs (proposed)`, `crates/monocode-core/src/task_board/transitions.rs (proposed)`, `crates/monocode-gpui/src/task_board/ (proposed)`.

### M10 — Board worktrees, versioned artifacts and file handoff

**Status:** Shipped MOLFAR-specific workflow. **Priority:** P0 safety / P1 full flow. **Order:** G4.

**Source evidence:** [M: `src/features/task-board/services/worktree.ts`:6–40](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/worktree.ts#L6-L40); [M: `src/features/task-board/services/stage-start.ts`:31–61](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/stage-start.ts#L31-L61); [M: `src/features/task-board/services/stage-start.ts`:119–140](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/stage-start.ts#L119-L140); [M: `src/features/task-board/services/actions.ts`:77–104](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/actions.ts#L77-L104).

**Native equivalent:** Native Git/worktree/checkpoint and generic artifact services exist; no equivalent Board stage file-handoff contract.

**Unique MOLFAR delta:** Retained worktree/fixed base, required artifact version references under ignored .molfar/board, stage fingerprints, legal action checks, gate/delivery races.

**Portability:** Adapt native worktree service; preserve Board artifact store and provenance in core; pass file paths to stage prompts rather than copying artifact bodies.

**Dependencies:** M03/M08/M09/M18/M11.

**Risks:** Dirty main overwritten; stale artifact version used; startup cancellation misses newly created session; duplicate final delivery.

**Suggested improvement — proposal:** Propose visible artifact prerequisites/version history and cancellation acknowledgment, with transition preconditions checked before filesystem writes.

**Observable acceptance criteria:**

- Main checkout untouched; retained worktree reused without dropping dirty files; missing artifact blocks launch.
- Selected versions/fingerprints match run receipt; prompt references existing input files, not expanded bodies.
- Cancel during startup stops newly created session; duplicate delivery rejected; failed handoff retains evidence and offers explicit retry.

**Expected native owners:** `crates/monocode-core/src/task_board/artifacts.rs (proposed)`, `crates/monocode-core/src/task_board/worktree.rs (proposed)`, `crates/monocode-core/src/task_board/dispatch.rs (proposed)`.

### M11 — App CLI, connector MCP, action authorization, idempotency and STOP

**Status:** Shipped base plus pending hardening; native common actions. **Priority:** P0. **Order:** G2 foundational / G4-G5 extensions.

**Source evidence:** [M: `src-tauri/src/control_cli.rs`:85–123](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/control_cli.rs#L85-L123); [M: `src/features/orchestration/model/orchestration.ts`:838–892](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/orchestration/model/orchestration.ts#L838-L892); [M: `src/features/orchestration/model/orchestration.ts`:950–963](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/orchestration/model/orchestration.ts#L950-L963); [U: `crates/monocode-core/src/app_access.rs`:15–39](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/app_access.rs#L15-L39); [U: `crates/monocode-core/src/mono/api.rs`:4–20](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mono/api.rs#L4-L20).

**Native equivalent:** Native bridge, request IDs, auth, inflight/receipt handling and most common Mono actions already exist.

**Unique MOLFAR delta:** 37-action MOLFAR app surface including Board/Confluence; distinguish control task namespace from app actions. Preserve scope, read/hash-before-write, effect/receipt atomicity and paused read-only behavior.

**Portability:** Extend native validation/action services at domain boundaries; port only missing actions/invariants. Shared native session-control semantics serve CLI, Board, Familiar and phone adapters.

**Dependencies:** G2 foundation needs M01/M02 only. Board/artifact/Confluence action extensions are implemented with their owning G4/G5 services M08/M10/M13/M18; those extensions do not block the foundational action boundary.

**Risks:** Retry after timeout/restart mutates twice; request ID reused with different input; receipt read error treated as absent; forbidden action bypass; STOP allows hidden restart.

**Suggested improvement — proposal:** Propose explicit versioned capabilities, stable actionable errors and consistent paused state; domain authorization independent of open UI.

**Observable acceptance criteria:**

- Same request+input produces one effect across timeout/restart; reused ID with changed input rejected; mutation and receipt commit together.
- Denied/out-of-project/stale approval or question call causes zero mutation; unknown action never falls through.
- STOP pauses control dispatch/queues; paused list/get/wait allowed, no implicit resume; preserve namespace-specific self-session protections.
- CLI/MCP fixture fields/errors match; cancel/disconnect does not duplicate accepted work.

**Expected native owners:** `crates/monocode-core/src/app_access.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-core/src/mono/bridge.rs`, `crates/monocode-gpui/src/monos/host.rs`, `crates/monocode-gpui/src/main.rs`.

### M12 — Jira Inbox hierarchy

**Status:** Shipped custom hierarchy over common connector. **Priority:** P1. **Order:** G5.

**Source evidence:** [M: `src-tauri/src/jira.rs`:15–24](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/jira.rs#L15-L24); [M: `src-tauri/src/jira.rs`:83–88](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/jira.rs#L83-L88); [M: `src/features/inbox/model/jira-issue-tree.ts`:18–114](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/inbox/model/jira-issue-tree.ts#L18-L114); [U: `crates/monocode-core/src/inbox/jira.rs`:13–15](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/inbox/jira.rs#L13-L15).

**Native equivalent:** Native Jira status/project/issues/details/thread/comments exist, but issue fields omit issuetype/parent and hierarchy metadata.

**Unique MOLFAR delta:** Epic/story/subtask hierarchy, cycle/orphan-safe projection, expand/flatten and selection behavior.

**Portability:** Extend existing Rust adapter DTO/parsers; translate pure hierarchy projection and reuse native Inbox rows. Carry pending shared HTTP behavior, not just its file layout.

**Dependencies:** M01/M02, account-scoped config; M21 HTTP safeguards.

**Risks:** Missing parent drops issue; cycles hang UI; duplicate IDs across sites; stale old-account response replaces new results.

**Suggested improvement — proposal:** Propose stable hierarchy row IDs, account-scoped expansion cache, keyboard disclosure and type text beyond color.

**Observable acceptance criteria:**

- Epic/story/subtask, missing/self/cyclic parent and mixed-project fixtures retain every visible issue.
- Expansion/selection survive refresh; keyboard search/navigation reaches children.
- Loading/empty/auth/timeout/retry distinct; changed-account response discarded; credentials never follow unsafe redirect.

**Expected native owners:** `crates/monocode-core/src/inbox/jira.rs`, `crates/monocode-gpui/src/inbox/ui.rs`.

### M13 — Confluence browser, context, app actions and connector MCP

**Status:** Shipped MOLFAR-specific integration. **Priority:** P1. **Order:** G5.

**Source evidence:** [M: `src-tauri/src/confluence/config.rs`:16–51](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/confluence/config.rs#L16-L51); [M: `src/features/confluence/model/api.ts`:23–98](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/confluence/model/api.ts#L23-L98); [M: `src-tauri/src/connectors_mcp/mod.rs`:1–85](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/connectors_mcp/mod.rs#L1-L85); [M: `src-tauri/src/connectors_mcp/tools.rs`:6–104](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/connectors_mcp/tools.rs#L6-L104).

**Native equivalent:** Native Jira and general MCP machinery exist; no corresponding Confluence browser/service or MOLFAR connectors-mcp endpoint found.

**Unique MOLFAR delta:** Space/page/folder tree, pagination/search/read, context mentions, hidden spaces, shared Atlassian configuration and CLI/MCP contracts (including existing Jira comment tool).

**Portability:** Adapt Rust HTTP/parsing with explicit config/path service instead of AppHandle; native tree/reader/search UI; extend existing native entry points rather than copying Tauri app shell.

**Dependencies:** M01/M11/M12; shared connector HTTP/error policy.

**Risks:** Stale cache crosses accounts; incomplete pagination; content kind mismatch; MCP writes bypass capability boundary.

**Suggested improvement — proposal:** Propose one connector service for UI/CLI/MCP, account-keyed cache, cancellable search/stale-result rejection and explicit read/write capability discovery.

**Observable acceptance criteria:**

- Nested space/page/folder and pagination fixtures match; missing/unsupported content, invalid token and timeout recover.
- Context preserves title/body/source URL; cancelled search cannot replace current selection; account disconnect clears cached pages.
- MCP/action shapes and existing write behavior fixture-tested; credentials excluded from logs; reader/tree keyboard and empty/error states covered.

**Expected native owners:** `crates/monocode-core/src/confluence/ (proposed)`, `crates/monocode-core/src/connectors_mcp/ (proposed)`, `crates/monocode-gpui/src/inbox/ (Confluence views proposed)`, `crates/monocode-gpui/src/main.rs`.

### M14 — Obsidian / Knowledge vault, graph and revision editing

**Status:** Shipped MOLFAR-specific integration. **Priority:** P1. **Order:** G6.

**Source evidence:** [M: `src-tauri/src/vault/mod.rs`:59–137](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/vault/mod.rs#L59-L137); [M: `src/features/knowledge/model/graph/resolve-links.ts`:4–83](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/knowledge/model/graph/resolve-links.ts#L4-L83); [M: `src/features/knowledge/model/document/prepare-vault-preview.ts`:44–100](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/knowledge/model/document/prepare-vault-preview.ts#L44-L100).

**Native equivalent:** Native file/editor/search/notes exist; no vault connection, backlink graph or equivalent revision-save service found.

**Unique MOLFAR delta:** Vault connection/scan/index, wiki/alias/relative links, graph, asset preview, add-to-context, cancellation and Companion vault API.

**Portability:** Reuse Rust scanner/path/revision routines with explicit native IO; translate link resolver using existing fixtures; adapt native editor/markdown/list before graph interaction. No React/DOM transplant.

**Dependencies:** M01/M02/M11, native files/editor and artifact-safe assets.

**Risks:** Symlink escape, overwriting external note, stale disconnected scan result, concurrent scans, large graph blocks input.

**Suggested improvement — proposal:** Propose service-owned scan/cancel state, generation-stamped snapshots and bounded worker projections; accessible list alternative and reduced-motion graph.

**Observable acceptance criteria:**

- Two views share one scan; cancel/reconnect rejects stale output; external edit causes revision conflict.
- No outside-vault read/write; encoded/relative/ambiguous/wiki links match fixtures; missing asset explicit.
- Large-vault operation remains cancellable; keyboard list/reader and graph alternative available; empty/error/retry paths preserve source files.

**Expected native owners:** `crates/monocode-core/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/knowledge/ (proposed)`, `crates/monocode-gpui/src/file_editor.rs`.

### M15 — Home dashboard and custom brand visuals

**Status:** Shipped MOLFAR-specific surface. **Priority:** P2. **Order:** G7.

**Source evidence:** [M: `src/features/home/model/home-layout.ts`:3–79](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/home/model/home-layout.ts#L3-L79); [M: `src/features/home/model/home-widget-registry.ts`:4–17](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/home/model/home-widget-registry.ts#L4-L17); [M: `src/features/home/model/home-data.ts`:26–39](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/home/model/home-data.ts#L26-L39).

**Native equivalent:** Native workspace/usage components exist; no equivalent custom ten-widget Home grid found.

**Unique MOLFAR delta:** Widget composition/layout persistence, recent sessions/automations/status and orb/fire/brand visual behavior.

**Portability:** Port aggregation contracts to native service and build native widgets using semantic tokens; import saved intent/order, not CSS pixel geometry.

**Dependencies:** M02/M04/M17/M16 and automation summaries.

**Risks:** Invalid saved layout silently reset; decoration masks empty/error states; background animations consume resources or impair reduced-motion users.

**Suggested improvement — proposal:** Propose responsive native grid, consistent chart/card tokens, keyboard rearrangement and pause decorative work when hidden/reduced motion.

**Observable acceptance criteria:**

- Copied visible widget set/order retained or explicit recoverable mapping shown; source preference never overwritten on parse failure.
- Empty/loading/partial/error cards show real state; navigation to session keeps selection.
- Keyboard rearrange alternative works; all animation obeys reduced motion and hidden-window pause; benchmark before claiming smoother rendering.

**Expected native owners:** `crates/monocode-core/src/home/ (proposed aggregation)`, `crates/monocode-gpui/src/home/ (proposed views)`.

### M16 — Usage dashboard and additional provider sources

**Status:** Shipped custom dashboard over common usage data. **Priority:** P1 data / P2 surface. **Order:** G7.

**Source evidence:** [M: `src/features/usage/model/fetch-usage.ts`:18–72](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/usage/model/fetch-usage.ts#L18-L72); [M: `src/features/usage/model/usage-card.ts`:11–26](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/usage/model/usage-card.ts#L11-L26); [U: `crates/monocode-core/src/usage.rs`:127–145](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/usage.rs#L127-L145).

**Native equivalent:** Native usage services/footer support multiple sources; generic usage is common. Dedicated MOLFAR Cursor/Antigravity dashboard paths are not equivalent to native subscription defaults.

**Unique MOLFAR delta:** Independent Claude/Codex/Cursor/Antigravity dashboard cards, normalized last-good/stale/error handling, history/trends.

**Portability:** Reuse native sources where contracts match; adapt missing Rust fetch/parsing logic and existing fixtures; one refresh owner, no duplicate poller.

**Dependencies:** M01/M02 and preference mapping; shared usage data precedes independent Home/Usage views. No dependency on M15.

**Risks:** Unavailable rendered 0%; failure erases prior values; account switching shows old account usage; stale data displayed current.

**Suggested improvement — proposal:** Propose visible source/time/stale labels and independent refresh/error handling; consistent accessible chart summaries.

**Observable acceptance criteria:**

- All four shipped dashboard sources represented or explicit parity blocker recorded.
- One failed refresh cannot erase other cards; last-good marked stale; missing values never fabricated.
- Old-account response ignored; retry/cancellation/empty/limited states correct; chart meaning available without color/hover.

**Expected native owners:** `crates/monocode-core/src/usage.rs`, `crates/monocode-core/src/usage/ (extend as needed)`, `crates/monocode-gpui/src/usage_dashboard/ (proposed)`.

### M17 — Custom settings, themes and saved defaults

**Status:** Shipped; many controls already common native. **Priority:** P0 import / P2 polish. **Order:** G2 import / G7 polish.

**Source evidence:** [M: `src/features/settings/model/display-prefs.ts`:4–115](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/settings/model/display-prefs.ts#L4-L115); [M: `src/features/settings/model/workspace-themes.ts`:6–32](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/settings/model/workspace-themes.ts#L6-L32); [U: `crates/monocode-gpui/src/settings/model.rs`:288–340](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/settings/model.rs#L288-L340); [U: `crates/monocode-gpui/src/settings/model.rs`:385–455](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/settings/model.rs#L385-L455).

**Native equivalent:** Native themes/glass, paced reveal, autocorrect, remaining usage and email masking controls already exist.

**Unique MOLFAR delta:** MOLFAR preference keys, palettes, saved defaults, new-layout opt-in policy and cross-window persistence. Do not duplicate common native controls.

**Portability:** Explicit versioned import map; preserve explicit source values and use reviewed native defaults only for absent keys. Native layout need not recreate old opt-in toggle.

**Dependencies:** M01/M02; copied web-storage export.

**Risks:** False/missing conflated; autocorrect default differs; importing unsupported setting overwrites source; view ordering lost.

**Suggested improvement — proposal:** Propose previewable import report listing mapped/unsupported settings, shared tokens and clear reset scope.

**Observable acceptance criteria:**

- Explicit true/false/value imports match source and survive reload; missing and invalid values distinguished.
- Unsupported keys retained in import manifest; no production storage access; failed write surfaced.
- Settings search/keyboard/focus/reduced motion and high-contrast states verified later; absent defaults approved before adoption.

**Expected native owners:** `crates/monocode-core/src/desktop_preferences.rs`, `crates/monocode-gpui/src/settings/model.rs`, `crates/monocode-gpui/src/theme.rs`.

### M18 — Document and HTML artifacts, cards and sandbox security

**Status:** Shipped; common native artifact base plus MOLFAR metadata. **Priority:** P0 security / P1 parity. **Order:** G2 storage/security / G4 Board integration.

**Source evidence:** [M: `src-tauri/src/artifacts.rs`:11–53](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/artifacts.rs#L11-L53); [M: `src-tauri/src/artifacts.rs`:192–242](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/artifacts.rs#L192-L242); [M: `src/features/artifacts/ui/HtmlArtifactFrame.tsx`:76–80](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/artifacts/ui/HtmlArtifactFrame.tsx#L76-L80); [U: `crates/monocode-core/src/store/notes.rs`:53–110](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/store/notes.rs#L53-L110); [U: `crates/monocode-gpui/src/monos/html.rs`:246–299](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/monos/html.rs#L246-L299).

**Native equivalent:** Native notes content_kind/artifact_kind, Mono artifact actions and sandboxed macOS WKWebView exist. Linux/Windows HTML currently falls back to text.

**Unique MOLFAR delta:** MOLFAR provenance/card identity, retries/deletion/theme/size/open-link behavior; Board versioned handoff is distinct M10.

**Portability:** Prefer native store and sandbox host; adapt metadata/contracts. Arbitrary interactive HTML cannot be replaced by native visual widgets without explicit behavior loss.

**Dependencies:** M01/M02/M11 and platform HTML implementation before required-platform parity.

**Risks:** Privileged app bridge/network/parent escape; forged resize/navigation; doc/HTML kind collision; platform text fallback loses functionality.

**Suggested improvement — proposal:** Propose validated artifact boundary, bounded resizing and explicit stale/deleted/unsupported states; accessible source fallback, never silently weaken isolation.

**Observable acceptance criteria:**

- Stable IDs/provenance survive reopen; retry updates one card; delete removes intended reference.
- Malicious HTML cannot call app bridge, fetch network or access parent DOM; opener/height messages validated.
- Keyboard focus can enter/exit; missing/corrupt content recoverable; required-platform HTML rendering or explicit approved scope waiver before release.

**Expected native owners:** `crates/monocode-core/src/store/notes.rs`, `crates/monocode-core/src/mono/api.rs`, `crates/monocode-gpui/src/monos/html.rs`, `crates/monocode-gpui/src/monos/cards.rs`.

### M19 — Companion HTTP/Tailscale gateway and BitChain compatibility

**Status:** Shipped gateway; pending PR119 hardening. **Priority:** P1. **Order:** G8.

**Source evidence:** [M: `src-tauri/src/companion.rs`:1–25](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/companion.rs#L1-L25); [M: `src/features/companion/model/protocol.ts`:158–225](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/companion/model/protocol.ts#L158-L225); [M: `src/features/companion/model/companion-executor.ts`:373–384](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/companion/model/companion-executor.ts#L373-L384); [H: `src/features/companion/model/companion-reply-input.ts`:1–70](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src/features/companion/model/companion-reply-input.ts#L1-L70).

**Native equivalent:** Native QUIC phone gateway exists but is not Companion v2 wire-compatible.

**Unique MOLFAR delta:** Default-off loopback/tailnet HTTP(S), hashed device tokens, BitChain pairing, Familiar/session STOP/approval/questions, Board and vault revision actions. BitChain client lives outside this repo.

**Portability:** Adapt Rust gateway/auth/bounds with native service dispatch; both gateways use one authorized domain layer, not one transport implementation.

**Dependencies:** M01/M02/M04-M11/M14 and M21 validation/config-corruption safeguards.

**Risks:** Stale or forged replies; duplicated mutation after disconnect; accidental wildcard/WAN bind; token reuse across identities.

**Suggested improvement — proposal:** Propose explicit reachability/offline state, per-device revoke, versioned capability negotiation and consistent bounded errors.

**Observable acceptance criteria:**

- Companion v2 fixtures retain all shipped custom methods; revoked devices denied and secrets not logged.
- STOP works while views hidden; stale/replayed approvals rejected; conflicts preserve vault/Board data.
- Corrupt pairing store backed up with visible error; default-off/no wildcard behavior retained; pairing/cancel/offline UI accessible.
- External BitChain client interoperability remains a later runtime gate, not inferred from server tests.

**Expected native owners:** `crates/monocode-core/src/companion/ (proposed)`, `crates/monocode-gpui/src/settings/ (Companion settings proposed)`, `crates/monocode-gpui/src/shell.rs`.

### M20 — Pending QUIC phone app and mandatory no-UPnP policy

**Status:** Pending PR117 mobile candidate; security decision mandatory. **Priority:** P0 no-router policy / P2 client. **Order:** G1 policy / G8 client.

**Source evidence:** [S: `mobile/app.json`:1–35](https://github.com/deluminor/molfar/blob/02b66c63bc9c2a69a91e326ab4b5e4a390de5762/mobile/app.json#L1-L35); [S: `src-tauri/src/mobile_access/tests.rs`:154–166](https://github.com/deluminor/molfar/blob/02b66c63bc9c2a69a91e326ab4b5e4a390de5762/src-tauri/src/mobile_access/tests.rs#L154-L166); [S: `docs/companion.md`:45–112](https://github.com/deluminor/molfar/blob/02b66c63bc9c2a69a91e326ab4b5e4a390de5762/docs/companion.md#L45-L112); [U: `crates/monocode-core/src/mobile/host.rs`:59–69](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mobile/host.rs#L59-L69); [U: `crates/monocode-core/src/mobile/host.rs`:249–287](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mobile/host.rs#L249-L287); [U: `crates/monocode-core/Cargo.toml`:25–36](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/Cargo.toml#L25-L36).

**Native equivalent:** Native core has QUIC MobileHost, pairing/watch/capability handling and phone app; upstream open_router defaults true and router dependencies remain.

**Unique MOLFAR delta:** Pending MOLFAR Expo branding/project linkage and commit 118b5c1a89ab2737285bad00acaf0d3aa44355b6 explicitly removing automatic router mapping. Current main does not ship this mobile client.

**Portability:** Reuse native mobile architecture/client; carry removal of router mapping/config/dependencies and add lockfile/config regression guard before any native runtime. Do not merely change default to false.

**Dependencies:** M01 first; M11 domain layer; custom phone capabilities depend on migrated services; mobile distribution remains separate approval.

**Risks:** Fresh native profile exposes router port; old config reenables mapping; 32 unpaired slots exhausted; external client capability mismatch.

**Suggested improvement — proposal:** Propose LAN/Tailscale/explicit reachability only, visible capability differences between gateways and bounded pairing/handshake resource tests. Handshake hardening is backlog unless separately implemented.

**Observable acceptance criteria:**

- Default/config/legacy fixtures never invoke router mapping; dependency/lockfile/source guard rejects igd-next/natpmp mapping restoration.
- Pair/revoke/reconnect/watch/STOP fixtures preserve native behavior; no listeners start by importing data.
- Pending client labeled candidate until devices/platform distribution tested; no EAS build/publish or account changes in setup.

**Expected native owners:** `crates/monocode-core/src/mobile/host.rs`, `crates/monocode-core/src/mobile/router.rs`, `crates/monocode-core/Cargo.toml`, `crates/monocode-gpui/Cargo.lock`, `mobile/app.json`, `mobile/src/features/connection/nativeLink.ts`.

### M21 — Lifecycle, persistence, validation and hardening invariants

**Status:** Pending PR119 remote; six additional local-only commits. **Priority:** P0 invariants / P2 cleanup. **Order:** G1-G2 then each owning slice.

**Source evidence:** [H: `src/app/model/workspace-snapshot-guard.ts`:1–24](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src/app/model/workspace-snapshot-guard.ts#L1-L24); [H: `src-tauri/src/git/command.rs`:23–58](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src-tauri/src/git/command.rs#L23-L58); [H: `src-tauri/src/http_client.rs`:1–58](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src-tauri/src/http_client.rs#L1-L58); [H: `src/features/companion/model/companion-reply-input.ts`:1–70](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src/features/companion/model/companion-reply-input.ts#L1-L70); `git show 9e4eb4538be7c7bddf2dcafbf83c963a91100f07:src/app/shell/sidebar/use-sidebar-session-list.ts`:1–60 (local-only commit; not assumed published).

**Native equivalent:** Native runtime/store/error/platform owners exist, but different code paths; Tauri/React structures are not native fixes.

**Unique MOLFAR delta:** Pending snapshot-load write guard, settled/logged boot writes, input validation, corrupt-config backup, safe Git environment/remotes, MCP load errors, lock recovery, dependency fixes. Local-only Sidebar/transcript splits and Files-tab loop fix remain separate.

**Portability:** Create per-invariant native owner/fixture map; preserve semantic fixes and native-appropriate recovery. Do not cherry-pick all React extractions, lockfiles or old dependency versions.

**Dependencies:** All slices; M01 before runtime and M02 persistence boundary.

**Risks:** Calling pending work shipped; assuming native already fixes bug because implementation differs; unread persisted layout overwritten by empty boot state.

**Suggested improvement — proposal:** Propose fail-closed persistence/error states, structured bounded diagnostics and deterministic event/timer tests. Refactor only when required by owned native behavior, without file-size targets.

**Observable acceptance criteria:**

- Snapshot load failure never overwrites unread stored layout; explicit successful recovery resumes writes.
- Partial boot writes report each failure; corrupt settings retain backup; malformed phone input has zero side effects.
- MCP failure is visible; inherited Git env cannot redirect repository; source-specific mutex recovery does not hide invalid state.
- Native regression reproduces relevant failure then passes fix; local-only UI changes remain evidence, not resumed B7.

**Expected native owners:** `crates/monocode-core/src/store/shared.rs`, `crates/monocode-gpui/src/workspace.rs`, `crates/monocode-gpui/src/runtime/persistence.rs`, `crates/monocode-core/src/mcp.rs`, `crates/monocode-core/src/remote.rs`.

### M22 — Backlog and optional improvements boundary

**Status:** Not shipped parity: separate proposals only. **Priority:** Deferred. **Order:** After G9; separate feature approval.

**Source evidence:** Local original `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar/docs/specs/task-board/spec.md`:115–123; captured in `scratch/evidence/task-board-spec-local.md` (unversioned planning evidence, not a shipped commit); [M: `src/features/task-board/types/card.ts`:14–37](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/types/card.ts#L14-L37); [S: `docs/companion.md`:110–116](https://github.com/deluminor/molfar/blob/02b66c63bc9c2a69a91e326ab4b5e4a390de5762/docs/companion.md#L110-L116).

**Native equivalent:** Native orchestrator depends_on exists, but does not establish Board card dependency support; native UI has distinct capabilities.

**Unique MOLFAR delta:** Board card dependencies are explicitly out of scope in current Board spec. Companion full-text vault search and push notifications are unimplemented. Deferred global-refactor Stages6-10 are not product features to promise.

**Portability:** Do not port non-existent behavior. Keep optional dependency graph/schema/cycle policy, phone search/push and major redesigns in separate plans after parity.

**Dependencies:** Detailed product approval after G9; no task automatically enables backlog.

**Risks:** Migration scope grows by treating wishlist as existing functionality; generic orchestration confused with persistent Board dependencies.

**Suggested improvement — proposal:** Propose later Board dependency design only if needed, with cycle/failure/cancel/recovery rules. Smoothness/visual improvements remain scoped to migrated slices.

**Observable acceptance criteria:**

- Inventory and release checklist clearly distinguish shipped, remote pending, local pending and backlog.
- No Board dependsOn schema/dispatch or push/search capability advertised before its own approved implementation and tests.

**Expected native owners:** `docs/specs/gpui-migration/spec.md`, `docs/specs/gpui-migration/tasks.md`.

## Pending hardening disposition

Published PR119 (`cc6433f6`) includes, among other changes:

- `08f13670`: phone question/approval validation.
- `517343d6`: root/per-surface error boundaries.
- `491a247f`: protect unread workspace layout after boot-load failure.
- `3b8a66ac`: settle and log boot-resume writes.
- `b441e9b9`: preserve corrupt companion config as backup.
- `d412cc68`: poisoned-lock recovery.
- `3585f9eb`: reject unknown tracking remotes.
- `4287e5d8`: surface MCP errors and log text-chain failures.
- `13aaa41e`, `3158e357`, `cc6433f6`: Rust splits, common repository command policy and shared tracker HTTP client.
- Dependency/test/shared-helper changes whose applicable behavior should be rechecked against the native dependency graph, not copied mechanically.

Local-only commits after published PR119 are `0432feffdc53dfdc44fceca111239547fb720615`, `143dbd60a1f48d0e5caaec0890a385dd82c1592a`, `46d12c0a9b066cd3975672d7e1574107d3b86244`, `b07d1989c562c9d3b78a20de5046106ffbb73391`, `865ecd01ed121d18f579ed7e4c3c56693b608bc0`, and `9e4eb4538be7c7bddf2dcafbf83c963a91100f07`. These include Sidebar/session-list and transcript pin/component extractions, baseline synchronization and the Files-tab loop fix. Their existence does not revoke B7 STOP, approve a push or require reproducing React file structure in Rust.

For each relevant invariant, assign a native owner and failure fixture. An upstream implementation being different is not proof that the failure is fixed. Broad cleanup and file-size reductions are not migration acceptance criteria.

## Proposed migration architecture, batches and sync plan

The following plan is reproduced in full for a self-contained review. Canonical editable copy: docs/specs/gpui-migration/plan.md. Executable task tracking lives in tasks.md/task-status.json; all 70 implementation/gate units remain proposed and not started. No todo executable or task-tracking API was available; the durable file tracker is an explicit fallback, not a claim that todo init ran.

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

## Deliverables and approval boundary

- `docs/specs/gpui-migration/spec.md`: scope, status distinctions, global and feature requirements.
- `docs/specs/gpui-migration/plan.md`: native boundaries, batches, risks, tests, parity and upstream procedure.
- `docs/specs/gpui-migration/tasks.md` and `task-status.json`: completed setup/planning versus proposed implementation units.
- `docs/specs/gpui-migration/inventory.json`: complete structured 22-feature register with evidence and acceptance.
- `docs/specs/gpui-migration/upstream-checkpoint.json`: frozen planning baseline; integrated SHA recorded, validated SHA null. Operational .github checkpoint is proposed, not installed.
- `docs/specs/gpui-migration/baseline-checks.json`: commands, exit codes and skipped scope.
- `docs/specs/gpui-migration/analysis.md`: final consistency review and its limits.
- `scratch/setup-verification.json`, `source-snapshot.json`, `source-evidence-validation.json`, baseline logs and raw delta manifests: setup/source evidence.
- This file: `scratch/gpui-migration-setup-and-inventory.md`.

No feature implementation is approved merely because a direction, setup action or planning artifact was approved. Wisp can attach this report and present the detailed batches for approval. First real native runtime work must follow isolation and copied-data gates; no production profile has been migrated.

## Final planning consistency and verification

Final preservation verification: 2026-10-27T00:42:07Z. All nine pre-existing worktrees preserved; branch/head exact; no tracked native source change. All nine setup/planning tasks complete; all 70 implementation/gate tasks remain proposed and not started.

# Analyze report — gpui-migration

## Scope and coverage

Read-only consistency review of spec.md, plan.md, tasks.md, inventory.json and task-status.json. This is a planning check, not a code/runtime/security certification.

- 12 global requirements and feature requirements R-M01–R-M22 traced to tasks or explicit backlog classification.
- 79 distinct task IDs match between Markdown and JSON: 9 authorized setup/planning units and 70 proposed implementation/gate units.
- M01–M21 each have characterize/implement/acceptance units and explicit source/native owner paths. M22 is an exclusion/classification requirement with no implementation task.
- All 22 feature records include source evidence, native equivalent, unique delta, portability, dependencies, risks, suggested improvement, observable acceptance, priority/order and target owners.
- All 88 source locators and line ranges verified against pinned Git objects or explicitly captured unversioned planning evidence. Locators are valid; runtime behavior remains unverified.

## Independent initial findings and resolution

The planner's independent d-analyze pass found three clarifications required before implementation:

1. Home M15 and Usage M16 formed a dependency cycle. Resolved: Usage data depends on runtime/preferences; Home may consume Usage. M16 no longer requires Home.
2. App-action M11 batch label omitted a Knowledge dependency. Resolved: remove the unsupported generic Knowledge prerequisite; explicitly separate G2 foundational action boundary from Board/artifact/Confluence extensions in owning G4/G5 slices. Companion vault actions belong to M19/M14 and do not require inventing app CLI vault actions.
3. Restart-surviving completion grouping and persistent global Board pause were stronger than shipped source behavior. Resolved: record shipped in-memory batching/stop flag and label those restart guarantees as additional proposed improvements requiring slice approval. Existing per-card cancellation/review-gate parity remains required.

The independent follow-up confirmation could not execute because that role hit its usage limit. The primary agent re-read the corrected records/spec/tasks, checked task sets and status/schema mechanically, and performed the final consistency assessment. Do not describe this as a second independent pass.

## Contradictions and ambiguity

No unresolved contradiction found in the final planning pass. Native action foundation and later feature extensions are deliberately separate stages; blanket feature-level dependency graphs must preserve those phases. Platform waivers, performance budgets after baseline measurement, distribution and source/main promotion remain explicit later approval gates. No fixed performance improvement or cross-platform parity is claimed from source inspection.

## Constitution and authorization

Direction/setup/docs approved; feature implementation remains false/not started. Existing worktrees, uncommitted changes, main, PR119 and B7 STOP preserved. No production data, GUI, install, commit/push/main merge or automation changes. The user-requested native merge-based history is a new-line policy; old content-patch automation and main ancestry CI remain unchanged. No file-size-driven or gratuitous refactors proposed.

## Verdict

PASS for final planning consistency and setup/inventory delivery. This is NOT approval to implement. Detailed feature-plan approval and the pre-implementation gate must be checked again against actual approved scope and then-current upstream/PR119 refs before any code changes.

Baseline native readiness remains BLOCKED: full rustfmt encounters nested Cargo workspace discovery; offline core tests cannot resolve uncached alacritty_terminal. Scoped format and 10 packaging fixture tests passed. Build/Clippy/native runtime/platform/security dependency gates were not completed; no application-readiness claim is made.
