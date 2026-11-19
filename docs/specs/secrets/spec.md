---
pr_title: "feat(secrets): OS keyring store, in-chat masked secret requests, event redactor and Settings → Secrets"
---
# Spec — Secrets 1/2: OS keyring store, in-chat masked request, event redactor, Settings → Secrets

## Problem

Agents often need credentials (API keys, tokens) to finish a task. Today the user can only paste them into the chat. A pasted value ends up in:
- the transcript and persisted session rows
- Companion and mobile snapshots
- external MCP session reads
- Board artifacts and logs

Provider `isSecret` prompts are rejected outright (`crates/molfar-core/src/provider/questions.rs:59`).

This card adds a safe path:
1. An agent asks for a named secret.
2. The user types it into an inline masked form, or manages secrets in Settings.
3. The value goes only to the OS credential store.
4. Before session output is persisted or shown anywhere, every known secret value is replaced with `[secret:NAME]`.

## Threat model (AC-1)

This section is copied word for word into `docs/specs/secrets/spec.md` before any code relies on it.

- **Accidental leaks only.** The goal is that a secret value never lands in MOLFAR-owned persistence or surfaces by accident. The covered surfaces are:
  - session rows and the transcript
  - Board artifacts
  - app-access receipts
  - external MCP audit and results
  - Companion and mobile payloads
  - app logs and crash logs
  - any plaintext file MOLFAR writes
- **Not hidden from the model.** The agent in the same session can read the secret through its own shell, for example by querying the OS keychain. MOLFAR does not try to stop that.
- **Literal matching only.** The redactor replaces exact occurrences of known values. It does **not** catch values that are base64-, hex- or URL-encoded, split, reversed or otherwise transformed.
- **Outside MOLFAR's reach.** These are not covered:
  - provider-owned files, such as the harness's own session or history files under the user's home directory
  - shell history files and the clipboard
  - text the user types or pastes into the composer
  - rows persisted before MOLFAR knew a value (old transcripts are not rewritten)
  - a replaced old value, after the app restarts
- **Memory hygiene is best effort.**
  - Core holds values in `secrecy::SecretString`: zeroized on drop, no `Debug` or `Serialize`.
  - The GPUI `Input` buffer is an `Arc<str>` (`SharedString`) and cannot be zeroized in place. It is cleared and dropped right after Save.
  - The OS store, not MOLFAR, protects data at rest.

## Current state (base f510a87d)

- `keyring` 3.6 is already a per-OS dependency (`crates/molfar-core/Cargo.toml`): `apple-native`, `windows-native`, and `linux-native-sync-persistent` + `crypto-rust`. Its only use today is the mobile identity (`mobile/host.rs`, service `com.molfar.mobile`).
- App access (`molfar_app` MCP + `molfar-native app` CLI):
  - Calls go through `familiar/bridge.rs`, whose server-side reply timeout is 60 s.
  - Calls are authorized and dispatched in `molfar-gpui/src/shell/app_commands.rs`.
  - Only Operator-enabled, non-remote threads get access. Read-only and plan threads get read actions only.
  - Results of mutating calls are persisted as receipts keyed by request ID.
- Projects have **no stable id**. They are identified by path everywhere: workspace, rail, and mobile (`project_id` is the URL-encoded path).
  - A session's `summary.cwd` is the project root; a worktree session runs in `settings.worktree_cwd`.
  - Deleting a project is `Shell::delete_project` (`shell/project_removal.rs`).
- Every provider event enters a session through one closure: the `emit` callback passed to `provider::run_with_controls` in `molfar-gpui/src/runtime.rs`. Rows built there are what gets persisted (`native_rows`), rendered, sent to Companion and mobile, and read by `sessions.read` (internal and external MCP).
- Masked input exists (`Input::set_secret`). Undo history exists only in code mode.
- Mobile waiting states are `approval | question` (`conversation/mobile.rs`, `mobile/src/features/workspace/types.ts`). Companion keeps only a fixed set of block roles (`shell/companion/blocks.rs`).
- `docs/specs/` is git-ignored. Existing tracked specs were force-added.

## Decisions settled (grill round 1, user answers)

- **Settings Add and Replace (Q1 = A).** Settings → Secrets offers:
  - **Add secret**: name, scope picker (Global or a current project), masked value.
  - **Replace value**: masked value, then a confirm step.
  - There is no reveal, copy or export.
- **Moved project folder (Q2 = A).** If a project's last seen path no longer exists, its secrets show in Settings as "Missing project (last path …)" and can be deleted.
  - There is no re-linking and no marker file in the repo.
  - A folder moved back to its old path finds its secrets again, because the path key is unchanged.
- **Lead review constraints kept:**
  - a value never crosses serialization or the bridge
  - 8-byte minimum value length
  - keyring written first, with a compensating delete if the index write fails

## Scope

### 1. Store (`crates/molfar-core/src/secrets/`)

- **Keyring service:** `com.molfar.secrets`.
- **Scope:** `global` or `project:<project-id>`.
- **Project id:**
  - A random UUID minted on first use.
  - Kept in the `secrets.projects` native setting, keyed by the canonical project-root path key, as `{id, last_path, last_label}`. `last_path` and `last_label` are refreshed on each use.
  - The canonical root is the session's `summary.cwd`. If that path is a linked git worktree, it is resolved to the main worktree root.
  - Display-name changes never affect the id, and worktree sessions resolve the same id.
- **Keyring account:** `<scope>/<entry-uuid>`. Renaming therefore never rewrites the keyring value.
- **Index:** the `secrets.index` native setting holds `{id, name, scope, created_at, updated_at, delete_failed?}` and never a value.
- **Names:** environment-variable style, `^[A-Z_][A-Z0-9_]{0,63}$`, unique per scope.
- **Values:**
  - 8 to 1024 bytes of UTF-8, after trimming one trailing newline.
  - The minimum stops redaction from damaging ordinary text.
  - The maximum fits the Windows Credential Manager blob limit and is checked on all three OSes in CI.
  - Values exist only as `SecretString`. Types that hold values implement no `Debug`, `Clone`, `Serialize` or `Display`.
- **Write order:**
  - Create: write the keyring first, then the index. If the index write fails, delete the new keyring entry.
  - Replace: write the keyring entry in place, then bump `updated_at`.
- **Deleting a project:**
  - Removes every keyring entry and index row in the project's scope, and cancels the project's open requests.
  - A failed keyring delete keeps its index row flagged `delete_failed`. It shows in Settings with a retry, and the error is logged with name and scope only.
- **No store available:**
  - If no backend is reachable (for example Linux without Secret Service, or a locked collection), the store returns an explicit `Unavailable`.
  - There is **never** a plaintext fallback.
  - On Linux, availability is checked against Secret Service itself, so a keyutils-only (session-lived) write is never reported as saved.

### 2. Request actions (app access: `molfar_app` MCP + `molfar-native app` CLI)

**`secrets.request {name, reason}`**
- **Scope:** always the calling session's own project. Any `scope` or `project` field that names another scope is rejected. Global and other-project secrets are created only in Settings.
- **Caller:** must be an Operator thread, and not read-only or plan.
  - Familiar callers get an error saying Familiar secrets arrive in card 2/2.
  - Remote projects are already blocked.
- **`reason`:** 1 to 500 characters, single line after whitespace is collapsed.
- **Results, in order of checks:**
  1. `unavailable`: no OS store.
  2. `exists`: the name already exists in this scope, and the value is never overwritten.
  3. Otherwise the inline form opens and the call waits for one of:
     - `saved`: the value was stored.
     - `cancelled`: the user cancelled, the turn stopped, or the session was archived or deleted.
     - `exists`: the same name was created in Settings while the form was open. The form tells the user to use Settings → Replace instead.
- **Waiting past the bridge's 60 s timeout:**
  - A retry with the same request ID re-attaches to the open request.
  - The timeout message tells the agent to retry with the same ID.
  - The final status is kept as a normal app receipt (status only).
- **One open request per session.** A second request with a different request ID is rejected with an error.

**`secrets.list {}`**
- Returns `[{name, scope, createdAt}]` for this project plus global secrets, and never a value.
- Allowed in read-only threads.

No action, CLI command, MCP tool or Companion route returns a value. There are no `secrets_*` external MCP tools.

### 3. Event model

- **`SecretRequest` session record (metadata only):**
  - Fields: `{request_id, session, agent (harness + model label), name, scope, reason (untrusted), status: open|saved|cancelled|exists|expired}`.
  - Persisted as a transcript row with role `secret-request`, and updated in place when resolved.
  - A row still `open` when the app restarts loads as `expired`.
- **The value travels separately:**
  - From the inline form, it goes by an in-process UI → core command, `Shell::submit_secret`.
  - From Settings, it goes by in-process calls to `SecretStore::create` / `replace`.
  - Neither is ever serialized, persisted, logged or emitted as an event.
- **Companion:** the row becomes a `system` block reading "Secret request NAME — answer on desktop", and the session status is `needs-you`.
- **Mobile:**
  - A new waiting value `secret`, labelled "Answer on desktop" in the snapshot and in the mobile app (`types.ts`, `LiveSessions.tsx`, notifications).
  - Neither Companion nor mobile can answer.

### 4. Inline form (GPUI)

- A card at the conversation's pending-input position, as question cards are.
- **Shows:** the requesting session title, the agent label, the secret name and the scope, and a masked `Input`.
- **`reason`:** visually separated and labelled as agent-provided text ("The agent says:", muted, quoted, never rendered as markdown or links). This is the anti-phishing guard.
- **Save:**
  - Disabled until the value is within the length bounds.
  - Store errors show inline without closing the card.
  - On Save, the `Input` value is taken out as a `SecretString`. The buffer is then cleared, including selection, marked text and any undo/redo stack, through a new `Input::take_secret`. Then the card is dropped.
- **Cancel or Esc:** returns `cancelled`.

### 5. Central redactor

- **Where:** one `Redactor` in core, applied in the runtime `emit` closure to every provider event before rows are built. That is before persist, render, Companion, mobile, internal `sessions.read`, external MCP reads and Board artifact extraction.
- **Which values:**
  - Every value in the session's project scope plus global, from a shared in-memory registry.
  - The registry fills lazily from the keyring per scope.
  - It updates immediately on create, replace, rename or delete from chat or Settings. A value saved mid-turn is redacted for the rest of that turn.
  - On Replace, the old value stays registered under the same name until the app restarts.
  - On Delete, the value leaves the registry.
- **How:**
  - Each occurrence becomes `[secret:NAME]`, longest value first.
  - Each line of a multi-line value that is at least 8 bytes is also redacted.
  - Streamed deltas (assistant text, reasoning, any delta-style tool output) hold back a tail of at most (longest value − 1) bytes, cut on a char boundary.
  - The held-back tail is flushed at `Done`, on stop or on error, so a value split across chunks is still caught.
  - Snapshot fields are redacted whole: tool command, input, output, titles, status text, interjections, approval and question text.

### 6. Settings → Secrets

- A new section in the App group.
- **List:** name, scope (project label or "Global"), created and updated dates, and status.
  - An orphaned project scope shows as "Missing project (last path …)".
  - A `delete_failed` row shows "Delete failed — retry".
- **Add secret:**
  - Fields: a name, a scope picker (Global plus the current workspace projects) and a masked value.
  - It validates the same name and value rules as chat requests.
  - An existing name shows an inline "already exists — use Replace" and never overwrites.
  - Unavailable shows the store error.
- **Replace value:** masked value, then a confirm dialog naming the secret and scope. The old value stays redacted until restart.
- **Rename:** validated, unique per scope, index only. Redactions show the new name from then on.
- **Delete:** confirm dialog naming the secret and scope. Missing-project rows can be deleted the same way.
- There is no reveal, copy or export. Masked inputs are cleared with `take_secret` after submit or cancel.

### 7. Never

A value never appears in:
- the prompt, the transcript, persisted rows or artifacts
- Board cards or audit trails
- app-access receipts
- external MCP results, tool lists or audit
- Companion or mobile
- app logs, frame/hang logs or crash logs
- any plaintext file MOLFAR writes

## Acceptance criteria (mapped)

| AC | Requirement | Stage | Test |
| --- | --- | --- | --- |
| AC-1 | `docs/specs/secrets/spec.md` states the threat model (accidental leaks only, not hidden from the model, base64/hex not covered) before code relies on it | S1 | Spec file is in the diff before the S2 commit (review check) |
| AC-2 | `secrets.request` opens an inline masked form naming session, agent, name and scope. Save stores the value in the OS store and the agent gets `saved`; Cancel returns `cancelled` | S4, S5, S6 | `secret_request_save_returns_saved`, `secret_request_cancel_returns_cancelled`, `stop_turn_cancels_request`, card render test |
| AC-3 | The value never appears in persisted events, transcript, artifacts, audit, Companion, external MCP or logs, and output containing it shows `[secret:NAME]` | S3, S7, S10 | Redactor unit and property tests; test-provider `echo $X` / `env` / `cat .env` leak test over rows, receipts, Companion blocks, external `sessions.read` and a Board artifact; raw data-dir scan |
| AC-4 | `secrets.list` returns names only, and no API returns a value | S4, S10 | `list_returns_names_only`; scan of every action, route and tool list for value fields |
| AC-5 | An existing name returns `exists` and is not overwritten. A second open request in the same session is rejected | S2, S4, S5 | `existing_name_returns_exists_and_keeps_value`, `second_open_request_rejected`, `settings_add_during_open_request_returns_exists` |
| AC-6 | Keys are scoped by project id. A worktree session of the project resolves the same secret. Deleting the project removes its entries | S2, S8 | `worktree_session_resolves_project_scope`, `scope_isolation_between_projects`, `delete_project_removes_entries` |
| AC-7 | Linux without Secret Service returns `unavailable`, and nothing is written to disk in plaintext | S2, S11 | Mock error-mapping test; real-backend CI test without D-Bus; data-dir scan for the value |
| AC-8 | Settings → Secrets lists, renames and deletes (with confirm) without revealing values. Add and Replace work, and so does deleting a Missing-project row | S9 | Settings page tests |
| AC-9 | Companion and mobile show "answer on desktop" for a pending request | S6 | Companion block test, mobile snapshot test, mobile vitest |
| AC-10 | CI passes on macOS, Windows and Linux with real backends, and `npm run check` is green | S11, S12 | `secrets-backends` CI job; full `npm run check` |

## Out of scope (card 2/2 or later)

- `molfar-native app run --secret`, binding secrets into the environment at spawn, the `familiar:<id>` scope, and routing provider `isSecret` prompts. `questions.rs:59` stays as is.
- Familiar callers of `secrets.request`, and remote (`remote://`) projects.
- Redacting text the user types in the composer, rewriting older transcripts, catching encoded values, and scrubbing provider-owned history files.
- Re-linking orphaned secrets after a folder move, and repo marker files.

## Constraints

- Rust stable; `cargo fmt` and `clippy -D warnings` must pass.
- `npm run check` must pass, including the size, boundaries, moves and branding ratchets.
- `app_commands.rs` (654 lines) and `runtime.rs` (1270 lines) are already over the size ceiling. New logic goes into new files, with only small hook lines in those two.
- New dependency: `secrecy` (`zeroize` is already a transitive dependency). No new crate for string matching.
- The spec file must be force-added (`git add -f`) because `docs/specs` is git-ignored.
- No commit, push or PR without the user's ok.

## Risks

- **Linux keyutils-only writes.** `sync-persistent` may write to keyutils only when Secret Service is missing, and the value would be lost on reboot or logout. Mitigation: an explicit Secret Service probe reports `unavailable`. CI reads the value back from a fresh keyutils session.
- **Bridge timeout.** The bridge times out at 60 s, and the user may take longer to answer. Mitigation: re-attach on retry.
- **Values split across streamed chunks.** Mitigation: the held-back tail, flushed at turn end.
- **Short-value false positives.** Mitigation: the 8-byte minimum.
- **Settings and chat race on the same name.** Mitigation: the store decides at write time. The second writer gets `exists` and never overwrites.
- **Keychain prompts on dev builds.** Unsigned macOS dev builds may show Keychain access prompts. This is documented and is not a product defect.
- **File-size ratchet failures.** Mitigation: new modules and thin hooks.