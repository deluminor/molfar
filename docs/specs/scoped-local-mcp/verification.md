# Card 40 execution evidence

## Current outcome

Partial investigation only. No feature implementation, dependency pin, credential creation, client configuration change or runtime task submission occurred. S1 remains open; S2–S9 have not started.

## Compatibility inspection

- Baseline: `02fbe07286b2d098f4d715ab566c62300cf6c5d1` on the assigned branch; initial working tree clean.
- `command -v openbot` found no CLI. `/Applications/OpenBot.app` exists; its Info.plist reports version `0.72.0`.
- Read-only inspection of bundled `Contents/Resources/app.asar` found client SDK `1.32.1`, modern client/core packages `2.4.0`.
- `out/main/index.js` defines `mcpHandoffHeaders`, preserving configured Authorization headers. HTTP transport passes these via `requestInit.headers`. A modern probe pins revision `2026-07-28`; a separate legacy SDK transport path exists. This establishes source support, not successful negotiation.
- The bundle has Electron safeStorage encryption support. The complete MCP header persistence path still needs tracing; do not claim header-at-rest protection from the presence of safeStorage alone.
- `cargo info rmcp@3.10.0 --offline` exited 101 before fetching: SDK absent from the local registry cache.
- Normal `cargo info rmcp@3.10.0` exited 101 because sandbox DNS could not resolve index.crates.io. Approved elevated metadata fetch exited 0 and downloaded official rmcp 3.10.0; minimum Rust 1.88. No manifest or lockfile was changed.
- Candidate features: server and transport-streamable-http-server, with session support if legacy compatibility is retained. Final feature pin requires a compiled negotiation harness.
- Official configuration reference: https://docs.rs/rmcp/3.10.0/rmcp/transport/streamable_http_server/tower/struct.StreamableHttpServerConfig.html

## Reuse and scheduling seams

- `Store::board_create` and `Store::board_snapshot`: `crates/molfar-core/src/store/task_board/mod.rs`. Creation accepts stable caller identity and repairs missing initial task metadata. It does not establish general mutation receipts.
- `crates/molfar-gpui/src/familiars/host.rs`: background executor dispatch and post-execution setting receipts. Replace neither authorization boundary nor existing receipt semantics blindly.
- `crates/molfar-gpui/src/shell/app_commands.rs`: ordinary session authorization and dispatch; sessions.start and sessions.send/stop are existing runtime seams.
- `crates/molfar-gpui/src/main.rs`: quit/restart await background process shutdown before exiting. The future listener must join this lifecycle.
- Tokio 1.54.1 already exists in core. Background Store work and bounded GPUI ownership dispatch still require a scheduling test; source presence is not proof.

## Analyze gate

All eleven criteria are mapped to execution stages in plan.md. The current assignment supplies approval despite historical draft language. Internal stage controls remain excluded. No uncovered criterion was found; compatibility and separately authorized scratch smoke remain explicit gates. No implementation has begun.

## Limits to carry forward

Use at most 1 MiB request bodies, 32 queued operations, 8 active operations, 30-second dispatch deadlines, 100 entries per list and 6,000 characters per text page; apply stricter existing limits where present. Validate protocol envelopes separately from strict tool arguments.

## Next work

Complete S1: trace encrypted MCP header persistence; compile the pinned candidate SDK and negotiate with the installed client packages; prove a bounded Tokio/GPUI scheduling seam. Then implement S2–S9 using vertical red/green slices. Live scratch execution requires separate explicit authorization under the approved plan.
