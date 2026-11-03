# MOLFAR feature transfer register

Updated November 3, 2026. Source checkpoint: `8ef99c49`, including upstream
`main` through `00c69307`. This register records code and verified scope;
source presence and automated tests do not establish runtime parity.

Roadmap IDs M01–M22 retain their original meanings. Readiness M01–M08 are
separate Board/merge-readiness slices; readiness M02 is not roadmap M02.
The remaining runtime work is tracked in [limitations](parity.md).

| Roadmap | Current implementation and evidence | Remaining acceptance |
| --- | --- | --- |
| M01 — Identity and data isolation | MOLFAR crates, binary, app IDs, isolated development storage, shared desktop adapter and notice shipping retained; [entry point](../../crates/molfar-gpui/src/main.rs), [native guide](README.md). | Existing-data and simultaneous desktop/native use; platform/package acceptance. No release or cutover authorized. |
| M02 — Providers and sessions | Native transports, streaming, persistence and receipt-aware context adapted to upstream; [runtime](../../crates/molfar-gpui/src/runtime.rs), [providers](../../crates/molfar-core/src/provider.rs). | Live lifecycle/approval/MCP acceptance across all providers; historical smoke tests are not current certification. |
| M03 — Terminal, Git and worktrees | Existing native services reused; Windows shell discovery and terminal pane movement updated; [terminal](../../crates/molfar-gpui/src/terminal.rs), [SCM](../../crates/molfar-core/src/scm.rs). | Real platform terminal/Git interactions and retained-worktree acceptance. |
| M04 — Familiar identity and projects | MOLFAR IDs/names and native roster/session integration retained; [Familiar adapter](../../crates/molfar-core/src/familiar/desktop.rs), [roster](../../crates/molfar-gpui/src/familiars/mod.rs). | Existing roster/project associations and desktop data compatibility in actual use. |
| M05 — Soul and memory | Native file/memory services and mutable context retained; [files](../../crates/molfar-core/src/familiar/files.rs), [memory](../../crates/molfar-core/src/familiar/memory.rs). | Existing soul/topic/archive data and concurrent-edit acceptance. |
| M06 — Habits and scheduling | Native habit/scheduler implementation present; [habits](../../crates/molfar-core/src/familiar/habits.rs), [scheduler](../../crates/molfar-gpui/src/familiars/scheduler.rs). | Live scheduling, approvals, restart recovery and desktop coexistence. The upstream sync job is a separate automation. |
| M07 — Grouped completion reports | Existing Familiar completion handling retained; [host](../../crates/molfar-gpui/src/familiars/host.rs). | Live background delegation and durable grouped-report acceptance. |
| M08 — Board stage engine | Creation, repeated Grill, owner answers/plan edits, approval, Implement/Review/Rework, Final review, delivery/reject/archive, editing, kanban and legal drag/moves implemented; [Board](../../crates/molfar-gpui/src/task_board/). | Actual Board interaction, real GitHub delivery and platform acceptance. Drag limitations remain listed in parity.md. |
| M09 — Board models, skills and gates | Per-stage selection and frozen run settings implemented with Board tests; [settings](../../crates/molfar-gpui/src/task_board/settings/). | Live provider execution with the intended model/skills/access choices. |
| M10 — Board checkout and artifacts | Retained worktrees, immutable versioned handoffs, artifact validation and durable delivery steps implemented; [stages](../../crates/molfar-gpui/src/task_board/stage/). | Real push/PR/merge and recovery against a real remote. |
| M11 — App control and connectors | Native authorization/receipts and Familiar MCP bridge present; Tauri connector ports retained; [app access](../../crates/molfar-core/src/app_access.rs), [bridge](../../crates/molfar-core/src/familiar/bridge.rs). | Remaining native endpoints and end-to-end connector/STOP approval acceptance. Tauri connectors alone do not prove native parity. |
| M12 — Jira Inbox | Native Jira reader and Inbox UI exist; [Jira](../../crates/molfar-core/src/inbox/jira.rs), [Inbox UI](../../crates/molfar-gpui/src/inbox/ui.rs). | Full MOLFAR hierarchy, context, actions and native Jira acceptance remain open; readiness M04 is next work. |
| M13 — Confluence | Existing Tauri connector code retained; a full native Confluence browser/context/action surface is not delivered. | Readiness M05 and native end-to-end Confluence acceptance remain open. |
| M14 — Knowledge/Obsidian | Native file editor exists; [editor](../../crates/molfar-gpui/src/file_editor.rs). | Vault integration, graph, revision editing and complete Knowledge surface remain open. A file editor is not the Knowledge port. |
| M15 — Home | Native shell exists; the custom MOLFAR Home dashboard/visual composition is not delivered. | Full Home port and interaction/visual acceptance. |
| M16 — Usage | Native provider usage data and footer exist; [usage service](../../crates/molfar-core/src/usage.rs), [footer](../../crates/molfar-gpui/src/usage_footer.rs). | Full MOLFAR Usage dashboard and additional source parity. |
| M17 — Settings and defaults | Native settings/themes and desktop preference adapter retained and updated; [preferences](../../crates/molfar-core/src/desktop_preferences.rs), [settings](../../crates/molfar-gpui/src/settings/). | Remaining MOLFAR-specific settings and real-profile/platform acceptance. |
| M18 — Documents and visuals | Native document/HTML handling and notes storage present; [HTML panels](../../crates/molfar-gpui/src/familiars/html.rs), [notes store](../../crates/molfar-core/src/store/notes.rs). | Rich nested artifacts/cards, visual accessibility and sandbox/platform acceptance. |
| M19 — Existing companion gateway | Existing host and desktop contracts retained; upstream remote/phone logic adapted without replacing the deployed host. | Real HTTP/Tailscale/BitChain compatibility, machine installation and upgrades remain unverified. |
| M20 — Phone app and router policy | Mobile/shared/native phone code updated. Native router mapping remains opt-in/off by default; Tauri mapping stays absent; [host guard](../../crates/molfar-core/src/mobile/host.rs). | Real-device pairing, transport compatibility, reconnect and platform acceptance. No automatic router mapping is authorized. |
| M21 — Lifecycle and persistence | Native store/workspace and recovery tests retained; [shared store](../../crates/molfar-core/src/store/shared.rs), [workspace](../../crates/molfar-gpui/src/workspace.rs). | Actual quit/restart/crash behavior, shared-data concurrency and full platform acceptance. |
| M22 — Optional backlog | Optional improvements remain separate from the agreed migration scope. | Admission requires a concrete MOLFAR delta and explicit scope; not silently treated as a migration prerequisite. |

## Verification boundaries

The full native gate at `8ef99c49` passed locally: 823 core, 913 GPUI,
6 wheel and 31 Node tests; 2 core and 11 GPUI tests were ignored. Native
macOS CI and all six core matrix jobs also passed for that revision.
Production CI subsequently exposed two narrower configuration gaps: a Tauri
Windows-only test import compiled on other platforms, and mobile ESLint's
state-in-effect rule. [Verification](verification.md) records the repair and
its exact checks. Local passes are not a substitute for the final remote CI.

No milestone in this table is upgraded to full runtime parity by the upstream
sync. Continue manual feature work from the current [status](status.md), using
the human-approved readiness plan. Production remains React/Tauri until an
explicit cutover decision.
