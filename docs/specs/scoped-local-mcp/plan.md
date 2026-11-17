> Execution authority: the user assigned implementation of card #40 in this session.
> The copied draft status below describes the prior planning stage, not a new approval requirement.

# Plan — Scoped local MCP and session Board access

## Goal

Provide a revocable, project-scoped external MCP endpoint and supported internal Board actions while MOLFAR retains execution and approval ownership.

## Technical Approach

Use the official Rust `rmcp` SDK with a compatible pinned release and minimum transport features. Prove SDK/OpenBot compatibility before choosing the final version.

Current [MCP transport documentation](https://modelcontextprotocol.io/specification/latest/basic/transports) describes version-dependent transport behavior. The [rmcp server configuration](https://docs.rs/rmcp/latest/rmcp/transport/streamable_http_server/tower/struct.StreamableHttpServerConfig.html) exposes Host, Origin, body-size, cancellation, and legacy-mode controls. These must be configured explicitly and tested against the chosen revision; SDK defaults are not the security policy.

Use a dedicated async transport runtime and bounded channels to GPUI-owned runtime operations. Store/artifact work runs on workers. Never hold a Store lock while awaiting GPUI.

Place external authentication/transport concerns under `molfar-core/src/external_mcp/`; shared Board actions under `app_access/board/` and supported Store/domain modules. Native lifecycle and execution adaptation belong under `molfar-gpui/src/external_mcp/`.

Use durable, principal-namespaced receipts shared by the new mutation paths. Existing internal receipt behavior must not mask or bypass the new Board receipt contract.

## Architecture Overview

- External adapter authenticates credentials and resolves grants.
- Internal adapters validate the active Familiar/session capability and assigned projects.
- Both invoke typed shared Board operations with authorized project identities.
- Session mutations invoke MOLFAR’s existing GPUI runtime ownership path through a restricted external adapter.
- Receipt services reserve work before side effects, allocate durable target identity, and record acceptance/outcomes.
- Store services own Board validation, persistence, artifact recovery, and conflict checks.
- Native refresh notifications make mutations visible in existing Board views without launching stages.
- Settings owns server configuration and client grant management.

## Risks & Mitigations

- **Protocol mismatch:** run compatibility gate first; record tested client/SDK revisions.
- **Privilege crossover:** distinct principal types, authorization adapters, namespaces, and per-call checks.
- **Crash between persistence and dispatch:** durable reservation, target identity, explicit recovery states, fault-injection tests.
- **UI/stage races:** transactional eligibility checks and revision conflicts; no transport-side SQL.
- **Artifact partial failure:** version-aware recovery and immutable previous artifacts.
- **UI blocking or overload:** bounded workers/channels, explicit saturation errors, deadlines.
- **Credential exposure:** random high-entropy credentials, verifier-only storage, constant-time verification, one-time display, redacted audit.
- **Scope expansion:** retain stage/approval controls in Board UI unless the user explicitly chooses otherwise.

## Execution Stages

### S1 — Compatibility and dispatch gate

Files: crate manifests/lockfile when dependency selection is approved; implementation-stage planning records under `docs/specs/scoped-local-mcp/`.

- Establish the available OpenBot installation/configuration without exposing secrets.
- Verify secure bearer-header support and supported MCP revisions.
- Select/pin compatible SDK features and verify Tokio/GPUI scheduling with a small test harness.
- Map native startup/shutdown, Store migrations, project resolution, Board refresh, and session launch/send/stop seams.
- Fix documented resource constants: proposed 1 MiB body, 32 queued operations, 8 active operations, 30-second dispatch deadline, 100 list entries, and 6,000 characters per text page. Reuse stricter existing limits.
- If compatibility requires OAuth or a different transport, stop dependent implementation and revise scope.

Checkpoint: documented compatible path and nonblocking dispatch proof. Covers AC-4, AC-8, AC-10.

### S2 — Shared contracts and Board services

Files: `molfar-core/src/app_access/board/`, `store/task_board/`, `task_board/create/`, new focused update/archive domain modules.

- Define strict argument/result/error contracts and shared limits.
- Implement scoped list/read/create/update/archive/unarchive with existing Store create/snapshot/artifact APIs.
- Add supported Store operations for updates and archive state.
- Enforce idle/unqueued eligibility and concurrent-change conflicts.
- Produce versioned task artifacts for updates with recoverable partial writes.
- Bound and authorize artifact/question reads before accessing content.

Checkpoint: domain tests establish safe Board behavior without transport or agent launch. Covers AC-3, AC-6, AC-8, AC-11.

### S3 — Durable mutation receipts

Files: focused receipt modules under `molfar-core/src/app_access/`; Store schema/migration integration following repository conventions.

- Define principal/project/action/request-ID keys and canonical normalized-input digests.
- Persist reservation and target identity before mutation dispatch.
- Represent pending, accepted, completed, failed, and unknown outcomes explicitly.
- Handle simultaneous retries and changed-input conflicts.
- Reconcile card/task-artifact partial saves and session acceptance after restart.
- Bind follow-up identity to a persisted runtime turn; never rely solely on session identity.
- Recheck authorization before replay; preserve receipt identity across revocation/regrant without granting access.
- Keep accepted receipts for the target lifetime; deletion must not silently make a request ID reusable.

Checkpoint: crash/restart and concurrent retry tests show at-most-once accepted mutation effects. Covers AC-5, AC-6, AC-8, AC-11.

### S4 — Internal app Board integration

Files: `molfar-core/src/familiar/{api,bridge}.rs`, `app_access.rs`, `molfar-gpui/src/familiars/host.rs`, `shell/app_commands.rs`, relevant internal tests.

- Register Board actions for both authorized caller types.
- Normalize bridge/argument request IDs and use S3 receipts.
- Call S2 services through caller-specific project authorization.
- Extend MCP description and CLI help.
- Notify native Board views after mutation.
- Reject stage-control actions under the proposed v1 policy.

Checkpoint: Familiar and ordinary project-session tests exercise both MCP/CLI entry paths, including unauthorized projects and duplicate updates. Covers AC-3, AC-5, AC-9, AC-11.

### S5 — External grants and audit

Files: `molfar-core/src/external_mcp/` contracts/grants/audit modules and Store schema integration.

- Add independently revocable named client principals and verifier-only credentials.
- Store canonical project allowlists and independent scopes.
- Implement live rechecks, removed-project handling, redacted structured audit, and uniform unauthorized-target errors.
- Keep internal capability and Companion credentials unusable as external credentials.

Checkpoint: positive/negative scope matrix and revocation tests pass. Covers AC-2, AC-3, AC-9.

### S6 — Embedded transport and lifecycle

Files: core transport modules, `molfar-gpui/src/external_mcp/`, native initialization/shutdown, manifests/lockfile.

- Implement loopback `/mcp` with persisted configuration and explicit listener status.
- Allow only exact configured loopback Host authorities. Permit clients without Origin; reject unapproved present Origins.
- Enforce limits while streaming bodies and bounding work queues.
- Apply selected MCP revision rules without rejecting legitimate protocol metadata.
- Handle port conflicts, reconnect, malformed traffic, deadlines, disabling, and shutdown.
- Reject pending unaccepted work during shutdown; preserve accepted work and durable receipts.

Checkpoint: real HTTP MCP client tests on ephemeral loopback ports verify lifecycle and rejection boundaries. Covers AC-1, AC-2, AC-8.

### S7 — External tools and runtime integration

Files: external contracts/dispatch modules, native runtime adapter, existing session dispatch seams.

- Expose the specified external project/session/Board tools.
- Apply grants to every target and cursor.
- Route Board operations through S2 and mutations through S3.
- Launch sessions with MOLFAR defaults; atomically reject busy follow-ups.
- Expose bounded results, approval-needed guidance, terminal states, and scoped stop.
- Distinguish request cancellation from execution cancellation.

Checkpoint: read-only, submit-only, stop-only, combined-grant, reconnect, and restart flows pass without privilege escalation. Covers AC-2 through AC-8.

### S8 — Native Settings and setup documentation

Files: focused Settings page modules and registration/state integration; `docs/native/` setup guide and documentation navigation.

- Add server enable/disable, persisted port, actual endpoint, and error/retry state.
- Add client creation, one-time credential display, project/scope editing, and revocation.
- Clearly distinguish external access from existing outbound MCP configuration.
- Document secure OpenBot setup, tool contracts, retry/unknown semantics, limits, and MOLFAR approval ownership.
- Test state transitions through native test seams. No independent browser/visual QA.

Checkpoint: Settings tests prove configuration persistence and grant lifecycle. Covers AC-1, AC-2, AC-9, AC-10.

### S9 — Regression and authorized interoperability verification

Files: concern-local regression tests and setup/verification documentation.

- Run `npm run native:check`.
- Run affected stable/web checks if shared schema/source changes.
- Exercise existing Familiar MCP, Operator app access, and Companion permission regression tests.
- Fault-inject receipt persistence, artifact writes, dispatch acceptance, and shutdown boundaries.
- With separate explicit authorization, run one scratch-project OpenBot task and the complete AC-10 flow.
- Record exact commands, exit statuses, verified versions, and skipped/manual checks.

Checkpoint: all acceptance criteria have evidence; missing live client evidence remains explicitly unverified.

## Testing Strategy

- Unit: strict schemas, canonical identities, scope matrix, normalization/digests, receipt states, limits, artifact versions.
- Store integration: real file-backed test databases, migrations, partial artifact recovery, concurrent edits, archived filters, durable retries.
- Runtime integration: launch/send/stop ownership, busy races, approvals, terminal sessions, no-stage-start assertions.
- Transport integration: real SDK client, malformed messages, protocol metadata, unauthorized requests, chunked oversized bodies, Host/Origin checks, saturation, cancellation, reconnect, shutdown.
- Native integration: Settings state transitions and Board refresh notification paths.
- Live interoperability: separately authorized OpenBot scratch flow; no production task or credential creation during planning.

## Acceptance-Criterion Traceability

- AC-1: S6/S8/S9; lifecycle, persistence, port-conflict tests.
- AC-2: S5/S6/S7/S8/S9; credentials, scope matrix, live revocation.
- AC-3: S2/S4/S5/S7/S9; cross-project IDs, aliases, cursors, removed grants.
- AC-4: S1/S7/S9; default launch and atomic busy-follow-up tests.
- AC-5: S3/S4/S7/S9; concurrency, conflict, restart and unknown-outcome fault tests.
- AC-6: S2/S3/S7/S9; exactly-one card/artifact and zero stage-start tests.
- AC-7: S7/S9; status, pagination, approval and stop tests.
- AC-8: S1/S2/S3/S6/S7/S9; protocol/resource/thread/cancellation tests.
- AC-9: S4/S5/S8/S9; Settings, audit redaction, existing access regressions.
- AC-10: S1/S8/S9; compatibility evidence and authorized OpenBot smoke.
- AC-11: S2/S3/S4/S9; both internal callers/entry paths and complete Board mutation tests.

## Constitution and Analyze Gate

This read-only stage supersedes artifact persistence and task initialization requirements: no files, runtime configuration, credentials, commits, or handoff contents were changed.

The execution stages serve as the draft task breakdown. Coverage: 11 acceptance criteria mapped to 9 stages; no uncovered criteria or orphan stages. The draft resolves the previous task dependency gap by placing internal Board integration after shared mutation receipts, and includes update/archive/unarchive explicitly.

Draft consistency: PASS under the proposed v1 stage-control exclusion. Implementation remains gated by Board approval and S1 compatibility evidence. Choosing expanded stage control requires revising contracts, permission rules, and tests before implementation.