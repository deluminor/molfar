> Execution authority: the user assigned implementation of card #40 in this session.
> The copied draft status below describes the prior planning stage, not a new approval requirement.

---
pr_title: "feat(native): expose scoped local MCP and session Board actions"
---
# Spec — Scoped local MCP and session Board access

## Problem

OpenBot needs to hand agreed work to MOLFAR on the same Mac and retrieve results. Familiars and project sessions also need supported Board actions instead of direct database writes.

MOLFAR remains responsible for execution, model selection, runtime approvals, and Board stages.

Status: draft for Board review. Keep the card in Backlog until approved. This planning stage changes no files.

## Repository evidence

Inspected checkout: `02fbe07286b2d098f4d715ab566c62300cf6c5d1`; working tree clean before and after inspection.

- `crates/molfar-core/src/app_access.rs` provides shared session helpers, conversation paging, and Operator action validation. Its allowlist excludes Board actions.
- `crates/molfar-core/src/familiar/api.rs` validates internal action arguments; `familiar/bridge.rs` supplies CLI help and MCP access.
- `crates/molfar-gpui/src/familiars/host.rs` dispatches Familiar calls through background workers and GPUI effects. Existing result receipts are persisted after execution; they do not alone establish crash-safe mutation acceptance.
- `crates/molfar-gpui/src/shell/app_commands.rs` handles ordinary session app access.
- `Store::board_create` supports caller-supplied card identity and recovery of missing initial artifact metadata after partial saves.
- `Store::board_snapshot` reads cards, runs, and artifact metadata. Artifact text has separate Store accessors.
- Core Board update/archive operations must be added or extracted into supported Store services. External callers must never use raw database writes.
- Native Settings already has MCP and Companion pages, but these do not constitute external client authorization.
- OpenBot was not found on the current shell PATH. Installed client version, secure header support, and SDK compatibility remain unverified.

## Scope

1. An opt-in, application-owned loopback Streamable HTTP `/mcp` endpoint.
2. Independent external client credentials with project allowlists and `read`, `submit`, and `stop` scopes.
3. External project/session reads, session start/follow-up/stop, and Board list/read/create.
4. Internal Board list/read/create/update/archive/unarchive for authorized Familiars and project sessions.
5. Shared Board domain operations, separate caller authorization adapters.
6. Durable mutation receipts, bounded requests/results, redacted audit metadata, Settings controls, and setup documentation.

## Proposed contracts

### External tools

- `projects_list`: authorized registered project identities.
- `sessions_list`, `sessions_read`: scoped status and bounded conversation/results.
- `sessions_start`: project, prompt, optional title, request ID.
- `sessions_send`: session ID, prompt, request ID; only when idle.
- `sessions_stop`: session ID and request ID.
- `board_list`: optional project and archived filter, bounded pagination.
- `board_read`: card ID and bounded artifact pagination.
- `board_create`: project, title, description, optional acceptance criteria/base reference, request ID.

External callers cannot choose model/runtime policy or inherit internal capability credentials. Session configuration comes from MOLFAR defaults through its existing launch path.

## External grants v2

Clients start with every grant off. Board, sessions, notes, knowledge, automations, inbox, and familiars each have independent read and write grants. Board creation, Board stage execution, and session stop require separate action grants (`board:create`, `board:run`, and `sessions:stop`). Tools that delete or reset require the additional `destructive` flag. Tools that act as the user or another agent require the additional `delegated` flag. Non-project resources use an explicit allowlist keyed by resource kind and ID (vault, inbox provider, familiar) and a separate receipt namespace. No current tool uses these two flags, the resource allowlist, or `board:run`.

| Legacy scope | Migrated grants |
| --- | --- |
| `read` | `board:read` and `sessions:read`. Either allows `projects_list`. |
| `submit` | `sessions:write` and `board:create`. |
| `stop` | `sessions:stop`. |

Migration preserves project assignments and adds no further permissions. Tool discovery and calls use the current client grants. Permission denials are audited with metadata only.

`board_update`, `board_archive`, and `board_unarchive` require `board:write`, a card in a granted project, and a request ID. Update changes only title, description, or acceptance criteria on an unarchived, idle, unqueued Backlog card. Archive and unarchive require an idle, unqueued card. Receipts are scoped to client, project, action, and request ID. Reusing an ID replays the saved result for matching input and conflicts for different input. `board_read` includes `allowedActions` with the same moves as desktop, including the Back guard, plus eligible edit, archive, and unarchive actions.

External MCP never exposes plan approval, delivery (commit, push, or pull request), runtime approvals, model overrides, external client or scope management, Familiar or automation permission changes, project or app-access administration, credentials (including inbox tokens, vault credentials, Companion pairing, and settings secrets), or shell and arbitrary execution.

### Internal actions

- `board.list {project?, archived?, limit?, cursor?}`
- `board.read {cardId, artifactKind?, artifactVersion?, maxChars?, charOffset?}`
- `board.create {project, title, description, acceptanceCriteria?, baseRef?, requestId}`
- `board.update {cardId, title?, description?, acceptanceCriteria?, requestId}`
- `board.archive {cardId, requestId}`
- `board.unarchive {cardId, requestId}`

The existing bridge-level request ID remains supported. Normalize it once; reject conflicting argument/envelope IDs. Every mutation requires a stable request ID after normalization.

Internal session permissions remain capability-gated. Board actions do not implicitly enable app access for otherwise unauthorized sessions.

### Authorization

- `read` permits external discovery and reads.
- `submit` permits external start/send/card creation.
- `stop` permits external execution cancellation.
- Scopes are independent; Settings explains that result retrieval requires `read`.
- Every call rechecks current credential validity, scope, and canonical registered project membership, including receipt replay.
- Internal calls derive projects from current caller assignments, never from caller-supplied claims.
- Unauthorized target IDs and foreign pagination cursors reveal no protected metadata.
- An omitted project means all authorized projects for listing; creation requires an explicit project.
- No authorization through string prefixes, symlink aliases, arbitrary filesystem paths, or transport session IDs.

### Board mutation rules

- Creation persists exactly one idle, unqueued Backlog card and its task artifact.
- Update accepts only the listed content fields on an unarchived, idle, unqueued Backlog card. An empty patch fails.
- Successful updates produce a new task artifact version; previous versions remain unchanged.
- Proposed archive/unarchive policy: only idle, unqueued cards; neither action moves columns, stops execution, nor starts stages. Repeating the requested archive state succeeds without duplicate effects.
- Domain checks and changes occur atomically against concurrent UI/stage mutations. Conflicting changes return an explicit conflict.
- Archived listing follows existing snapshot semantics: `false` selects active cards; `true` selects archived cards.
- Artifact reads use registered card artifacts with bounded text, never caller-supplied paths.

## Acceptance criteria

### AC-1 — Application lifecycle

Disabled by default. Enabling binds only loopback and exposes `/mcp`. Restart restores enabled state and configured port; quitting closes the listener. Port conflicts show recovery guidance and leave execution usable. Disabling prevents new calls without cancelling accepted runs.

### AC-2 — Credentials and scopes

Missing, invalid, or revoked credentials fail before tools execute. Read-only credentials cannot submit or stop. Grants are checked on every call, including existing connections and receipt retrieval.

### AC-3 — Project isolation

Listings contain only authorized projects and targets. Cross-project IDs, path aliases, foreign cursors, removed projects, and reduced allowlists cannot bypass checks or leak protected metadata.

### AC-4 — Session submission

An authorized external client can list/read sessions, start one, and send a follow-up while idle. MOLFAR owns runtime/model defaults. Concurrent or busy follow-ups return an explicit error without another turn.

### AC-5 — Durable idempotency

Identical normalized input under the same principal/project/action/request ID returns the original accepted result across concurrency, reconnect, and restart. Changed input conflicts. Interrupted outcomes are reconciled through durable target identity; unknown outcomes never trigger blind redispatch.

### AC-6 — Safe Board creation and reads

Creation produces exactly one idle Backlog card and initial task artifact. Reads expose criteria, stored plan when present, questions, artifact versions, and stage/run state. Missing optional artifacts are represented explicitly. No stage or agent starts.

### AC-7 — Results and stopping

Session reads distinguish running, completed, failed, cancelled, and needs-input states, with stable bounded pagination. Pending approval directs the user to MOLFAR. Stop is scoped, preserves session history, and reports an already-terminal session without starting work.

### AC-8 — Transport and resource boundaries

Reject malformed JSON, invalid tool arguments, unknown argument fields, unsupported versions, oversized bodies, invalid Host, and disallowed Origin before domain execution. Accept protocol-defined metadata and extension envelopes according to the selected MCP revision.

Bound request size, concurrent work, queue capacity, response size, and deadlines. Transport work does not block GPUI. Client cancellation and shutdown cannot duplicate or implicitly cancel accepted execution.

### AC-9 — Settings, audit, and existing permissions

Settings supports enable/disable, actual endpoint/port, named client creation, one-time credential display, project/scope changes, revocation, and errors. Store credential verifiers only.

Audit client/action/target/request ID/outcome without credentials or prompt/transcript bodies. Existing Familiar and Companion permission boundaries remain intact.

### AC-10 — OpenBot interoperability

Verify a supported secure credential mechanism and compatible protocol revision before committing to the transport implementation. In a separately authorized scratch project, prove tool discovery, scoped reads, submission, result retrieval, duplicate replay, Backlog reading, reconnect, and revocation.

Never put credentials in URLs. Unsupported secure authentication requires a revised plan, not an implicit OAuth fallback.

### AC-11 — Internal Board access

Authorized Familiars and project sessions can list/read/create/update/archive/unarchive assigned-project cards through both `molfar_app` and `molfar-native app`. Help documents the actions. All mutations dedupe by request ID. Update eligibility, artifact versioning, isolation, and no-stage-start behavior are enforced by shared core services.

## Out of scope

Stable Tauri parity; OAuth; remote access; background daemon; cloud relay; automatic client wakeups.

Proposed v1 also excludes internal stage queueing/approval, answering Grill questions, and moving columns. The questions block presents this remaining product decision.

## Constraints and risks

- Use existing core services and GPUI execution ownership; never reuse Familiar credentials.
- Preserve existing internal session capabilities while restricting the new external surface.
- Keep new modules cohesive, nested by concern, and approximately below 250 lines per file.
- Database and artifact-file persistence can fail independently; recovery must preserve identity and artifact versions.
- Accepted runtime work can outlive an HTTP request. Receipt state must distinguish acceptance from completion.
- Compatibility and live smoke evidence are release gates; synthetic tests alone do not establish OpenBot interoperability.