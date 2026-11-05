# Native preview limitations

The native app is still experimental. A feature being present in source does not
establish runtime or platform parity with the production React/Tauri app. See
[verification](verification.md) for recorded checks.

Current local implementation checkpoint: `0eaa7ea0`, including the
Companion gateway. The source checkpoint records upstream `main` through
`a25b5b89`. Board execution/delivery and Home/Usage are implemented, with
runtime gaps below. The [feature register](feature-transfer.md) accounts for
M01–M22; [verification](verification.md) separates local evidence from historical
remote/upstream checks. Production stays React/Tauri. Native releases and full
cutover remain pending.

Working branch, checkout and publication boundaries: [migration status](status.md).

## Providers

All eleven providers have discovery, model selection and native transports.
The live results below are historical spot checks, not certification of every
provider feature or the current revision.

| Provider | Transport | Last recorded live coverage |
| --- | --- | --- |
| Claude Code | stream-json | Streaming, resume and cancellation during the initial native slice |
| Codex | app-server | Streaming, relaunch persistence, resumed context and cancellation (Oct 22) |
| Cursor | ACP | Catalog, streaming, two-turn resume and read-only Plan mode (Oct 19) |
| Grok Build | ACP | Catalog, streaming and two-turn resume (Oct 19) |
| OpenCode | HTTP/SSE v1/v2 | Current transport has source review only; earlier ACP checks do not cover it |
| Pi | RPC | Catalog, streaming and two-turn resume (Oct 19) |
| omp | RPC | Catalog, streaming and two-turn resume (Oct 19) |
| fx | ACP | Catalog, streaming and two-turn resume (Oct 19) |
| Hermes Agent | ACP | Catalog; prompt blocked by upstream account credit (Oct 19) |
| Antigravity | ACP | Protocol fixtures only; no installed server for a live check |
| Devin | ACP | Catalog, streaming, two-turn resume and supervised write approval (Oct 19) |

Changes to provider lifecycles on Oct 21 still need live checks, especially
steering, compaction, rewind, warm resume, questions and MCP confirmations.
Command discovery before the first turn is incomplete outside Pi/omp.
Provider permissions depend on the CLI: Cursor's default policy did not request
approval for every edit. Native Supervised mode does not add that guarantee.

## Application work

| Area | Remaining verification or work |
| --- | --- |
| MOLFAR Jira/Confluence | Native Jira/Inbox source exists, but full MOLFAR hierarchy/context/actions and native Confluence browser remain open (readiness M04/M05). Tauri connector functionality is not native acceptance. |
| MOLFAR Home/Usage | Implemented: native Home is the first sidebar and project-rail destination with all ten desktop widgets (Clock, Status, Brand orb/fire/sphere, Host, Usage, Inbox, Activity heatmap, Sessions, Automations, Matrix) on the 12-column grid, a stacked narrow layout, drag/resize/hide/show/Reset persisted in the workspace, staggered entrance and gliding reflow. Usage is a Home widget fed by the shared accounts usage cache; there is no separate Usage page by owner decision. Host stats use a native libc sampler. Desktop localStorage layouts are not imported. Actual application interaction and visual verification remain outstanding. |
| MOLFAR Knowledge | Knowledge/Obsidian vault/graph/revision surfaces remain open. Native file editing does not close this port. |
| MOLFAR Board | Implemented: grouped list/detail, Backlog creation with initial task snapshot, Grill rounds in visible native sessions, owner answers/change requests and versioned plan editing, durable settlement, cancel/retry/restart recovery, spec/plan artifacts and transition into Plan approval; stage transition policy, per-stage model/skill/access settings, Retry with another model and Back; explicit plan approval, Implement, Code review and owner-selected Rework → Code review cycles in the retained worktree, ending at Final review; delivery by pull request, squash-merge or kept branch, reject and archive with resumable steps and desktop cleanup rules (archiving a Done card keeps its branch). Real push/PR/merge has not been exercised. Task editing (idle Backlog/Plan approval, base branch only in Backlog, new task version) and Move to… with the desktop legal targets are implemented; the Board shows desktop-style kanban columns with a reserved-width detail panel, column model chips and drag-and-drop between legal columns. GPUI cannot rotate the drag ghost, the live stalled/elapsed status is not shown, and a drag is not cancelled when the window loses focus. Actual application interaction and platform verification remain outstanding. |
| Chat | Live attachment/steering/rewind checks, complete keyboard selection and screen-reader navigation, richer nested task artifacts and provider-specific task controls |
| History and workspace | Transcript/database paging, cache runtime checks, remaining desktop layout consumers, explicit import/export |
| Files and Git | Platform visual/IME checks, Linux/Windows media hosting, non-Git checkpoints, per-file checkpoint Undo/Keep and orchestration checkpoint integration |
| Accounts and settings | Live OAuth/MCP authentication checks and remaining platform-specific settings behavior |
| Inbox | Runtime/visual checks, inline video, linked-update notices and richer CI evidence/repair progress |
| Notes | Runtime/visual checks and composer note-card presentation |
| Automations | Scheduler, provider and recovery checks; current implementation has source review only |
| Familiars | Existing-data checks, live heartbeat and background delegation checks, native visual/document accessibility, floating-document interactions and durable orchestration recovery |
| Remote connections | Real-machine installation/update, existing-data restoration and cross-platform checks; the existing host's feature limits still apply |
| Integrations | Completion/approval notifications, sounds and Dock badges; Quick Composer attachments/shortcut checks, MCP/skills checks and remaining app-control endpoints. macOS reminder delivery and click routing passed on Oct 22 |
| Companion / BitChain | Native gateway and phone RPCs have isolated tests at local `8840e63c`; actual phone/Tailscale pairing, reconnect and provider use remain unrun. Photo/file attachments, Knowledge and phone Board actions remain unsupported. |
| Shared data | Concurrent Tauri/native use with active scheduled tasks or phone connections remains unverified and deferred |

## Platform and distribution

The local release preparation adds an independent Native Packages workflow with
validation builds and manual GitHub prerelease publication. Tauri release logic
and its feed remain unchanged; Native has no configured updater. Mac public
packages require signing/notarization; validation packages cannot enter public
collection. Hosted matrix builds, signing configuration, environment protections
and package installation/upgrade acceptance remain unverified. See
[release instructions](../releasing.md#two-release-paths) and the latest verification
entry for the native gate result.


The manual platform checks below describe upstream source builds; they do not establish runtime verification of the MOLFAR migration branch.

macOS is the primary verified preview target. Remaining verification includes
accessibility, IME and scroll profiling, crash/recovery testing and actual
packaged upgrades.

On October 25, a Linux ARM64 source build was launched and exercised in an
Ubuntu 24.04 Noodle VM using Rust 1.98 and a VM-specific graphics workaround.
This covered launch and basic UI interaction, not live provider requests or
installation/upgrades of the downloadable Linux x64 packages. On October 27,
a Windows 10 x64 source build passed manual title-bar interaction checks;
broader Windows GUI behavior and the downloadable packages still need runtime
testing.

On Linux and Windows, HTML panels currently use a text fallback, native
notification delivery is unavailable, and media hosting still needs platform support.
Windows close-to-tray behavior also needs implementation/verification.
Desktop webview preferences (theme, projects, model defaults, and related
settings) are read from the installed app on Linux as well as macOS. The Windows
WebView2 reader has synthetic fixture coverage on Linux; real Windows profile
compatibility remains unverified. The reader opens only a temporary copy;
copying an actively written profile is best-effort.

The preview workflow checks core on macOS, Linux and Windows, but checks/builds
the GUI only on macOS.

## Board presentation follow-up — November 4, 2026

Board polish `32aeae48` adds opaque drawer surfaces, compact controls, grouped
settings, cached Markdown with independent description/criteria disclosure and
header Edit using the existing guards. Automated interaction checks and an
optimized macOS build passed; actual native UI QA was blocked by Computer Use
access refusal. This does not close provider, remote delivery or platform runtime
acceptance. Jira work is deferred by the owner. See [verification](verification.md).

## Board desktop presentation follow-up — November 4, 2026

The local follow-up uses compact 28px header buttons, an Overview and artifact
version tabs, compact metadata and a stage timeline with per-run session links.
A bounded flex layout reserves detail-panel width; the Board owns the horizontal
scrollbar, including with the application sidebar open. Project filtering and
anchored column model/access/skills configuration reuse existing native services.
Manual dark/light and window-size screenshot comparison is blocked by Computer
Use access refusal; source and synthetic checks do not establish visual parity.
