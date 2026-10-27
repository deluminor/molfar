# MonoCode GPUI assessment for MOLFAR

**Recommendation:** keep React + Tauri as MOLFAR’s production architecture, selectively port upstream features, and evaluate GPUI through a small isolated proof of concept. This is a fresh assessment of current code. GPUI already has substantial implementation and active development, but full adoption now would require porting business logic, custom integrations and data as well as rewriting UI. Available evidence does not establish that performance gains or simpler maintenance justify that work yet.

## Research snapshot

**26 October 2026, 21:27 UTC.** Live GitHub/API and `git ls-remote` checks agreed:

| Repository / branch | Exact commit | Commit date |
|---|---|---|
| MonoCode `mc/migrate-monocode-to-gpui` | [`ea6c8219bae954a3d8a9e8c536242b9531a683f7`](https://github.com/hardbeat920/monocode/commit/ea6c8219bae954a3d8a9e8c536242b9531a683f7) | 26 Oct, 16:10:09 UTC |
| MonoCode `main` | [`26465c620977f3951d0a532a0f7db32c3c179007`](https://github.com/hardbeat920/monocode/commit/26465c620977f3951d0a532a0f7db32c3c179007) | 23 Oct, 12:19:38 UTC |
| MOLFAR inspected checkout, `main` | [`4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0`](https://github.com/deluminor/molfar/commit/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0) | 25 Oct, 20:10:15 UTC |
| MOLFAR open PR119 | [`cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5`](https://github.com/deluminor/molfar/commit/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5) | 26 Oct, 17:53:38 UTC |

The GPUI branch was **136 commits ahead and one behind upstream main**, according to GitHub’s comparison API. It is a separate development line, not the current production branch.

Local MOLFAR was clean before and after research. PR108 is present in its history; PR119 remains open and was inspected separately through Git objects. No checkout switches, existing-worktree changes, implementation edits, app execution, browser QA, commits, pushes, or B7 actions occurred. Upstream objects were downloaded into an isolated temporary bare repository.

## What upstream is actually building

Rust is retained and expanded. GPUI replaces the React-rendered desktop interface and much of Tauri’s shell responsibility. The rewrite also ports behavior previously implemented in TypeScript into Rust.

The meaningful boundaries are:

| Layer | Current implementation |
|---|---|
| `crates/monocode-core` | Provider transports, accounts, transcripts, persistence, Git/files, remote connections, mobile gateway, Monos, habits, orchestration and app actions. No Tauri or GPUI dependency. |
| `crates/monocode-gpui` | Native shell, composer, transcript, editor, terminal, settings, panes, notifications and platform integration. |
| Existing `src` / `src-tauri` | React/Tauri application remains alongside native implementation. |
| `host` | Separate remote-host implementation remains TypeScript/Node. |
| `crates/mobile-link` / `mobile` | Phone transport and client are separate concerns from desktop rendering. |

These boundaries are visible in the [core module exports](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/lib.rs#L1-L49), [core dependencies](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/Cargo.toml), and [GPUI entry point](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/main.rs#L6-L100).

**Important qualification:** this is currently a parallel implementation. Tauri’s manifest does not depend on `monocode-core`; extracting reusable core services has not automatically unified both applications.

Native dependencies also extend beyond “Rust + GPU”:

- Pinned `gpui-pre` **0.3.9**, with vendored framework/platform patches.
- SQLite through bundled `rusqlite`.
- `alacritty_terminal` for native terminal emulation.
- Tree-sitter and embedded QuickJS editor/formatting bundles.
- Provider CLI executables and their authentication.
- Git/SSH and, for remote-host operation, a Node runtime.
- macOS WKWebView for HTML panels.

Consequently, native adoption does **not** eliminate JavaScript, webviews, external processes or platform-specific maintenance. See [GPUI dependencies and patches](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/Cargo.toml#L8-L97), [embedded editor execution](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/editor_analysis.rs#L100-L135), and [HTML hosting](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/monos/html.rs#L246-L299).

## Implementation and readiness

This branch is substantially beyond scaffolding:

- Eleven provider identities and native transport implementations exist.
- Streaming events include text, reasoning, tools, approvals, questions, usage, background tasks and completion.
- Session storage, existing-desktop-data access, account switching, terminal rendering, editor, Git, Monos and mobile services contain real implementation.
- Persistence coalesces streaming saves while flushing delivery and terminal boundaries; revision checks protect against stale transcript writes.

Concrete evidence: [provider events](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/provider.rs#L60-L125), [persistence behavior and tests](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/runtime/persistence.rs#L1-L106), and [revision conflict protection](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/store/shared.rs#L816-L838).

GitHub reports **successful CI at the inspected tip**: core Clippy/tests on macOS, Linux and Windows; native formatting, Clippy, tests and GUI build on macOS. That is meaningful automated evidence, not cross-platform runtime certification. [Exact CI run](https://github.com/hardbeat920/monocode/actions/runs/40356488460), [workflow scope](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/.github/workflows/native.yml#L27-L64).

Distribution exists: native preview releases and packaging configurations cover Apple Silicon/Intel macOS, Linux x64 and Windows x64. However, the inspected `preview.7` release’s published assets contained macOS and Linux packages, without a Windows installer. Configured targets and published artifacts must be distinguished. [Release](https://github.com/hardbeat920/monocode/releases/tag/native-v0.16.0-preview.7), [release matrix](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/.github/workflows/native-release.yml#L14-L39).

Remaining gaps include actual fallbacks or missing behavior:

| Area | Evidence at inspected revision |
|---|---|
| Linux/Windows notifications | Returns unsupported/unavailable; Dock operations are no-ops. |
| Linux/Windows HTML panels | Displays text fallback rather than embedded HTML. |
| Non-macOS video | Displays “Video playback is unavailable on this platform.” |
| Threaded linked discussion | Opens external URL because native discussion pane is unimplemented. |
| Broader parity | Accessibility/IME, provider lifecycle combinations, scheduled recovery, packaged upgrades and concurrent shared-data use remain incompletely verified. |

Sources: [notification fallbacks](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/notifications/platform.rs#L22-L50), [HTML fallback](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/monos/html.rs#L296-L299), [video fallback](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/file_editor/media.rs#L549-L563), [discussion fallback](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/shell/notifications.rs#L1233-L1248), and [upstream parity record](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/docs/native/parity.md).

Upstream records macOS live checks and a limited Linux ARM64 VM smoke test. Those are historical upstream observations, not tests performed in this research. Windows GUI execution remains unverified in that record.

**Performance:** worker execution, batching, virtualized transcript layout and diagnostics provide plausible architectural advantages. No controlled MOLFAR-versus-GPUI measurements were collected. Claims about faster startup, lower memory, smoother scrolling or smaller packages remain unproven.

## Feature-by-feature portability

“Portable” below means reusable data, contracts or algorithms. It does not mean compatible without adaptation.

| Feature | Existing MOLFAR evidence | Consequence of adopting native upstream |
|---|---|---|
| Provider/harness integration | [Normalized TS events and run context](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/integrations/harness/core/types.ts#L9-L177) | Protocol fixtures and semantics transfer. Existing TS adapters require a JS service or Rust behavioral port. Upstream Rust transports are candidates, subject to MOLFAR-specific approvals, app access and account behavior. |
| Sessions, streaming, tools | [Persisted session extensions](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/sessions/data/session-store.ts#L40-L93) | Preserve Familiar transcript, queued messages, Task Board links and worktree metadata. Native rows/events differ from MOLFAR blocks/reducers. Transcript UI rewrites completely. |
| PTY/terminal | [Tauri PTY bridge](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/platform/tauri/pty.ts#L1-L25) | Rust process logic can adapt. xterm rendering, event bridge, replay ownership and lifecycle need explicit replacement by native terminal behavior. |
| Git/worktrees | PR119 [split Git modules](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src-tauri/src/git/mod.rs#L1-L19); upstream `core/git`, `core/scm`, `worktree_management` | Strong Rust reuse/adaptation opportunity independent of UI choice. Retain hardening changes and compare operation/error contracts individually. Git UI rewrites. |
| Persistence/preferences | Upstream [desktop database opening](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/store/shared.rs#L197-L239) | Existing MonoCode DB support is useful, but not proof of MOLFAR schema compatibility. Familiar roster, layouts and other web-storage settings need explicit migration. Unknown-field preservation alone does not restore unsupported behavior. |
| Remote host | [Shared TS provider adapters](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/host/providers.ts#L1-L50) | JSON protocol and host services can remain. Native desktop adoption does not automatically replace Node host or preserve every capability. |
| Phone transport | MOLFAR [Tailscale HTTP(S), protocol v2](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/companion.rs#L1-L25); upstream [QUIC mobile host and method list](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mobile/host.rs#L1-L41) | Different transports and clients. Current BitChain companion compatibility requires retaining/adapting MOLFAR gateway or coordinated client migration. Upstream phone support is not a drop-in replacement. |
| General UI | PR119 [Sidebar](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src/app/shell/Sidebar.tsx), [AgentTranscript](https://github.com/deluminor/molfar/blob/cc6433f697f1ba4471f1aa76f33e7f1d7ea3e0c5/src/features/sessions/ui/AgentTranscript.tsx) | React components, hooks, DOM/CSS behavior and browser tests do not directly transfer. Preserve behavior/test scenarios; rewrite widgets and platform interactions. |
| Familiar, soul, memory, habits | [Files and conflict model](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/familiars/model/familiar-files.ts#L13-L50); upstream [Mono services](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/mono.rs#L1-L62) | Substantial conceptual overlap. Markdown/JSON, hashes and algorithms are portable; MOLFAR policies, naming, private provider stores, habit execution and approvals still require reconciliation. Familiar UI/floating windows rewrite. |
| Task Board/stage engine | [TS engine](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/engine.ts#L10-L66), [injected ports](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/task-board/services/ports.ts#L25-L66) | No equivalent MOLFAR stage engine found in native upstream. Preserve TS service through adapter or port behavior to Rust. Upstream orchestration plans are not equivalent to durable board stages, gates and artifacts. |
| Artifacts | [Sandboxed HTML contract](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/artifacts/ui/HtmlArtifactFrame.tsx#L76-L80) | Bodies/version metadata transfer. Arbitrary interactive HTML requires web hosting with equivalent isolation; native visual components are not equivalent. Linux/Windows fallback is a material regression. |
| App CLI | [37 supported actions](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/control_cli.rs#L85-L123) | Rust client/wire pieces portable. TS action handlers, request idempotency, scopes, pause/STOP semantics and Board/Confluence actions must be retained or ported. Matching action names does not prove parity. |
| Jira / Confluence | Upstream [native Jira adapter](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-core/src/inbox/jira.rs#L1-L30); MOLFAR [Confluence HTTP](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/confluence/http.rs#L1-L29) | Jira overlaps substantially. MOLFAR Confluence implementation needs transplant/adaptation; no corresponding native Confluence module found. Config/auth compatibility and issue bindings require checks. React readers/search/settings rewrite. |
| Obsidian / Knowledge | [Vault scan, cancellation, revision save](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src-tauri/src/vault/mod.rs#L59-L135) | Rust scanner/filesystem logic portable after Tauri wrapper changes. TS wikilink resolution and previews require rehosting/porting; graph/editor/browser UI rewrites. No equivalent native vault feature found. |
| Home / Usage | [Home aggregation](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/home/model/home-data.ts#L14-L39), [usage fetching](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/usage/model/fetch-usage.ts#L18-L72) | Data aggregation and provider fetch logic portable. Dashboard layouts, canvas visuals, charts and hooks rewrite. Upstream usage footer does not establish parity with MOLFAR dashboard. |

The central migration cost is ownership of behavior across languages and runtimes, not just framework syntax.

## Three genuinely new upstream features we can bring into current MOLFAR

### 1. Change account without replacing an idle conversation

Commit [`5fda02dd846f53d842117a4de007f51268d487b8`](https://github.com/hardbeat920/monocode/commit/5fda02dd846f53d842117a4de007f51268d487b8), 25 October.

Upstream keeps an idle conversation in place when changing accounts. A usage-limited conversation resumes; an ordinary idle conversation waits for another prompt. Busy conversations follow a separate path. [Implemented routing](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/shell/accounts.rs#L107-L139).

MOLFAR currently opens a fresh conversation for a started, non-limited session. [Current behavior](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/app/workspace/flows/composer/provider-account.ts#L29-L56).

**Port: adaptation.** Reuse existing `transferHarnessSessionAccount`; generalize usage-limit transfer orchestration to support idle transfer without automatic continuation. Preserve session ID, history, Familiar Codex exceptions and stale-result guards. GPUI widget code is not reusable; current provider transfer machinery is. [Existing transfer API](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/integrations/harness/core/registry.ts#L452-L475).

### 2. Familiar/Mono chats inside arbitrary session splits

Commit [`9d1ff62299267dc44006926ecc60a866ae96ffc9`](https://github.com/hardbeat920/monocode/commit/9d1ff62299267dc44006926ecc60a866ae96ffc9), 26 October.

Upstream adds Mono placement into split layouts, with persistence, detach/restore and orphan-cleanup tests. [Layout implementation](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/workspace.rs#L814-L883).

MOLFAR currently renders Familiar as a separate overlay with `inSplit={false}`. [Existing pane rendering](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/app/workspace/ui/workspace-main/FamiliarSessionPanes.tsx#L64-L94).

**Port: behavioral reimplementation.** Extend MOLFAR’s existing TS split tree and pane routing. Reuse layout components and upstream test scenarios. Do not copy native negative-integer pane IDs or `Entity<Conversation>` ownership into the string-ID React model.

### 3. Close the last terminal panel while preserving its shell

Commit [`34e0028d6a69f666ad0d45380615f8806d0b779c`](https://github.com/hardbeat920/monocode/commit/34e0028d6a69f666ad0d45380615f8806d0b779c), 26 October.

Upstream hides the panel instead of deleting its last terminal. A foreground job prompts for confirmation before stopping. [Implemented close behavior](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/shell.rs#L2989-L3027).

**Port: React behavior change plus adapted Rust process handling.** Reuse MOLFAR’s existing hide-panel operation and retain the mounted terminal. Current removal/unmount kills the PTY, so simply hiding a newly recreated terminal would not preserve the shell. [Current close path](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/app/workspace/flows/terminals/dock-terminals.ts#L81-L116), [unmount cleanup](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/src/features/terminal/ui/TerminalView.tsx#L379-L405).

The Unix foreground-process-group algorithm is reusable after adapting it to MOLFAR’s PTY owner. **Windows requires separate work:** upstream signals the foreground process only under `cfg(unix)`. [Exact implementation](https://github.com/hardbeat920/monocode/blob/ea6c8219bae954a3d8a9e8c536242b9531a683f7/crates/monocode-gpui/src/terminal.rs#L363-L375).

These examples demonstrate that useful upstream development remains accessible without adopting GPUI.

## Strategy comparison

| Strategy | Benefits | Costs and regression exposure | Upstream viability |
|---|---|---|---|
| **Stay React/Tauri; selective ports** | Preserves current product, PR108 boundaries and PR119 hardening. Reuses browser ecosystem and TS services. | Native-only features require translation. Increasing divergence if upstream stops maintaining Tauri. | Good for focused algorithms, protocols and fixes; weak for wholesale native UI changes. |
| **Complete native adoption now** | Aligns with upstream’s active development direction. Gains existing native shell and Rust services. | Rewrites custom UI; ports/rehosts TS behavior; migrates preferences/data; restores companion and connectors; inherits preview/platform gaps. | Better alignment for shared native features, but MOLFAR-specific integrations still create a maintained fork. |
| **Phased evaluation and selective core adoption** | Tests native value while preserving delivery. Allows framework-independent Rust reuse. | Temporary adapters and duplicate paths add complexity. Two full applications indefinitely would be costly. | Best opportunity to discover genuinely shared seams before committing to a shell rewrite. |

Upstream’s current policy explicitly focuses development on GPUI while retaining React/Tauri support; larger Tauri-specific features/refactors are temporarily deferred. This increases the future cost of staying, but does not establish that migration is justified today. [Pinned contribution policy](https://github.com/hardbeat920/monocode/blob/26465c620977f3951d0a532a0f7db32c3c179007/CONTRIBUTING.md#L7-L15).

MOLFAR also uses a content-patch workflow with rename/move mappings rather than merging upstream history. Its recorded synchronization branch is `main`; GPUI-branch features will not arrive automatically through that configuration. Native adoption would require reviewing this workflow too. [Sync checkpoint](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/.github/upstream-sync.json), [patch-sync rules](https://github.com/deluminor/molfar/blob/4abd5daeee9781f2ca3025a68ce5c2d4b7c738a0/docs/automations/upstream-sync.md#L12-L35).

## Recommendation now

Keep React + Tauri as MOLFAR’s production architecture. Preserve PR119 as the pending hardening baseline. Port selected upstream behavior through existing MOLFAR boundaries; consider individual `monocode-core` services where they reduce duplication without replacing working subsystems.

Do not commit to a permanent two-shell architecture. A JS sidecar could preserve TS services during native evaluation, but introduces IPC, packaging and lifecycle costs that must be demonstrated worthwhile.

I would reconsider full adoption when:

- Native upstream becomes the sustained production line and Tauri maintenance materially declines.
- Required-platform runtime, accessibility, HTML/media and update behavior meets MOLFAR’s requirements.
- A copied MOLFAR dataset round-trips without losing custom fields, preferences or Familiar/Board state.
- Representative measurements show a meaningful user-visible gain.
- A prototype demonstrates maintainable preservation of Board, Familiar, app CLI and companion semantics.
- Repeated selective-port work becomes demonstrably more expensive than maintaining MOLFAR additions on native upstream.

No calendar or effort estimate is defensible from source inspection alone.

## Optional PoC before any rewrite — proposal only

Build an isolated GPUI client for one copied session, deterministic provider-event replay, Familiar soul/memory access, one minimal Task Board stage through its existing port contract, and one HTML artifact. Use temporary app-data; leave production executable and databases untouched.

Acceptance criteria:

1. Text, tools, approvals, failure, cancellation and final settlement match current MOLFAR fixtures.
2. Session/custom metadata and Familiar files round-trip without loss; hash conflicts remain enforced.
3. Board stage settles exactly once; STOP prevents further dispatch; pending approval never advances automatically.
4. Provider shutdown leaves no child process; credentials and project scopes remain isolated.
5. HTML artifact preserves sandbox/content behavior on required platforms, or records a blocking parity failure.
6. Startup, idle/streaming memory, long-transcript responsiveness and package size are measured against current MOLFAR on the same machine and workload.
7. Required-platform package launch is verified separately from compilation.
8. The result exposes a maintainable service boundary without creating two independent implementations of core session behavior.

## Evidence limits

This research verified live refs, inspected source/diffs and checked GitHub CI metadata. Local builds, tests, performance benchmarks and application/UI execution were intentionally not run. Native runtime correctness, complete MOLFAR data compatibility and full feature parity remain unproven.
