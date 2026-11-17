# Card 40 execution evidence

## Current outcome

Partial implementation. S2 includes trusted archive/unarchive and scoped card/artifact read primitives. S1 remains open; S3–S9 have not started. No listener, dependency pin, credential creation, client configuration change or runtime task submission occurred.

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

## Baseline verification results

`npm run native:check` exited 101. Native script tests passed 44/44; formatting and Clippy completed successfully. Core tests: 961 passed, 15 failed, 2 ignored. Inspected Familiar bridge and SSH bridge failures report `Operation not permitted (os error 1)` while establishing local test bridges under the sandbox. The complete failure set has not been rerun with elevated permissions; do not classify every failure as environmental without that check. The chained GPUI test command was not reached. Full console output was captured at `/private/tmp/molfar-card40-native-check.log` for this session; that temporary file is not a durable artifact.

`git diff --cached --check` and the configured staged secret scanner exited 0 before the initial checkpoint. No source behavior changed, so no feature TDD evidence exists. The session ended at an investigation checkpoint due to available session budget; this is not a completed implementation stage.

## Continuation 1 checkpoint

Implemented the transport-independent S2 archive primitive as `Store::board_set_archived`.
It uses an immediate transaction, checks the expected revision and idle/unqueued
eligibility, preserves stage state, and advances the revision monotonically. This
is a trusted Store operation: caller authorization and mutation receipts remain
required in the future adapters. No adapter exposes this operation yet.

TDD: focused tests first failed with E0599 (missing method); after implementation,
`cargo test --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-core --profile native-dev store::task_board::archive -- --test-threads=1`
exited 0: two passed. Tests cover round-trip, stale revision, missing card,
running/queued rejection, preserved content, and no stage runs.

`npm run native:check` exited 101: script tests 44 passed; format and Clippy
passed; core tests 963 passed, 15 failed, 2 ignored. Failures include sandbox
permission denials in local socket fixtures and a process-resource test.
GPUI tests were not reached. No elevated full-suite rerun was performed.
`git diff --check` exited 0; commit hook secret scan accepted the implementation.

Session budget ended before completing the feature. S1 remains open. S2 has only
the archive/unarchive Store primitive; shared scoped contracts, update/artifact
versioning, and bounded reads remain. S3–S9 remain unimplemented. All eleven
acceptance criteria remain incomplete. No SDK pin, listener, grants, receipts,
Settings UI, runtime dispatch, or live client verification was added.


## Continuation 2 checkpoint

Commit `5b8ed4b0` adds `Store::board_scoped_card` and
`Store::board_scoped_artifact`. Trusted callers must supply current registered
project assignments or grants; these methods do not authenticate callers.
Project identity uses exact membership, with uniform missing/unauthorized card
errors. Artifact reads authorize before reading artifact metadata/content and
reuse existing registered-artifact, path, symlink and file-size protections.
Pages count Unicode scalar values, cap output at 6,000 characters, reject invalid
sizes/offsets, and expose the next character offset. No session/stage is launched.
These primitives are not exposed through internal or external adapters yet.

TDD RED: focused compilation exited 101 for missing methods in each vertical
slice. GREEN after implementation and after the argument-struct refactor:
`cargo test --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-core --profile native-dev store::task_board::access -- --test-threads=1`
exited 0, two passed. Tests cover project isolation, alias rejection, missing
cards, Unicode paging, terminal pages, invalid page sizes/offsets and path input.

`npm run native:check` exited 101: script tests 44/44; format and Clippy passed;
core tests 965 passed, 15 failed, 2 ignored. GPUI tests were not reached.
The output includes sandbox-denied socket fixtures. Elevated rerun results follow.
`git diff --check` exited 0; local commit hooks accepted the implementation.

S1 remains open. S2 still needs strict action contracts, bounded listings,
card detail/run/question metadata, updates with immutable artifact versions and
recovery, and adapter integration. S3–S9 remain open. No acceptance criterion
is complete. Live OpenBot scratch execution still needs separate authorization.

Elevated rerun: scripts 44/44, formatting and Clippy passed; core tests
980 passed, 0 failed, 2 ignored (exit 0). Core doctests passed (zero tests).
The full `npm run native:check` process was still compiling the GPUI test target
at this checkpoint; its final exit status and GPUI test results are unverified.
Output: `/private/tmp/molfar-card40-run2-elevated.log` (temporary, not durable).
Full application build, coverage and dependency audit were not run. No UI QA.
