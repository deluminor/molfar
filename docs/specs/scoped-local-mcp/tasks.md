# Scoped local MCP execution tasks

The user authorized the supplied S1–S9 plan. Stage controls remain excluded from v1.

- [~] S1: rmcp pinned to `=3.10.0` (server + streamable HTTP server features) with hyper HTTP/1. Real HTTP tests negotiate `2025-06-18` and reject unsupported versions. Transport runs on its own Tokio runtime; GPUI receives calls over a bounded channel. Installed OpenBot negotiation and header storage remain unverified (live smoke gate).
- [x] S2: strict Board contracts (`app_access/board/{contracts,actions,update}.rs`); scoped list/read/create/update/archive/unarchive; idle Backlog update versions the task artifact; deterministic card IDs.
- [x] S3: durable principal-scoped receipts (`external_mcp/receipts.rs`) reserved before dispatch; conflicts, replay, unknown follow-up outcomes; session launches reuse `create_app_session` reservations.
- [x] S4: Familiar and Operator Board actions, CLI/MCP help, input `requestId` envelope fallback, Board refresh after mutations.
- [x] S5: external clients with verifier-only credentials, independent scopes, project allowlists, revocation and metadata-only audit.
- [x] S6: loopback `/mcp` listener, persisted enabled/port, Host/Origin/body/version checks, port-conflict errors, quit shutdown.
- [x] S7: nine external tools in the GPUI adapter (`shell/external_mcp/`) scoped to granted registered projects.
- [x] S8: Settings → MCP → External access; `docs/native/external-mcp.md`.
- [~] S9: `npm run native:check` and regression suites run; separately authorized OpenBot scratch smoke not run.

Acceptance coverage follows plan.md. AC-10 needs the user's explicit authorization for the live OpenBot smoke.

External MCP continues in three cards. Card 1 adds per-domain grants, client naming, the External access redesign, and Board edits. Card 2 covers Board transitions, sessions, and notes. Card 3 covers knowledge, automations, inbox, and Familiars.
