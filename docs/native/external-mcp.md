# External MCP access

MOLFAR Native can expose a local MCP endpoint so a client on the same Mac, such
as OpenBot, can hand over agreed work and read its results. MOLFAR sets the models, harness defaults, and runtime policy. The endpoint uses
the same Board stage runner as the desktop.

## Turn it on

1. Open **Settings → MCP** and scroll to **External access**.
2. Choose **Turn on**. The endpoint listens on `127.0.0.1` only, by default on
   port `47821`, at `http://127.0.0.1:47821/mcp`. The enabled state and port are
   saved and restored on the next launch; quitting MOLFAR closes the listener.
3. If the port is busy, MOLFAR keeps working and Settings shows the error. Use
   **Port … · use …** to move to the next port, or stop the other program.
4. Choose **Add client**. Copy the key shown once; MOLFAR stores only a SHA-256
   verifier, so a lost key cannot be shown again. Revoke the client and add a
   new one instead.
5. Grant the client one or more projects and the permissions needed for its
   tools. Read and Write grants are independent. Board creation, Board stage
   actions, and stopping a session each have a separate grant. Permanent
   deletion also requires **Destructive**.

   Changes apply to the next call, including on a connection the client keeps
   open. **Revoke** invalidates the key.

## Configure OpenBot

Add an HTTP (Streamable HTTP) MCP server with the URL above and an
`Authorization` header with the value `Bearer <key>`. Use OpenBot's own secure
header storage. Never put the key in the URL, a prompt or a shared file.

## Tools

| Tool | Grant | Purpose |
| --- | --- | --- |
| `projects_list` | `board:read` or `sessions:read` | List granted projects registered in MOLFAR |
| `sessions_list`, `sessions_read` | `sessions:read` | List sessions and read paged exchanges |
| `sessions_start`, `sessions_send` | `sessions:write` | Start a session with app defaults or follow up in an idle session |
| `sessions_stop` | `sessions:stop` | Stop a running turn and keep its history |
| `sessions_update`, `sessions_archive`, `sessions_unarchive` | `sessions:write` | Rename, archive, or restore a session |
| `sessions_delete` | `sessions:write` + `destructive` | Permanently delete an accessible session |
| `board_list`, `board_read` | `board:read` | Read card state, runs, questions, and eligible actions |
| `board_artifacts_list`, `board_artifacts_read` | `board:read` | List registered versions and read one page by kind and version |
| `board_create` | `board:create` | Add one idle Backlog card |
| `board_update`, `board_archive`, `board_unarchive` | `board:write` | Edit eligible Backlog cards or change their archive state |
| `board_start`, `board_answer`, `board_request_changes`, `board_rework`, `board_retry`, `board_back`, `board_cancel` | `board:run` | Run the matching desktop stage action |
| `notes_list`, `notes_read` | `notes:read` | List notes attached to granted projects and read paged text |
| `notes_create`, `notes_write` | `notes:write` | Create in an explicit project or edit an existing scoped note |
| `notes_delete` | `notes:write` + `destructive` | Permanently delete an accessible note |

Session `status` is `idle`, `running`, `needs-input`, `completed`, `failed` or
`cancelled`. `needs-input` means an approval or question waits in MOLFAR; the
endpoint cannot answer it. Board stage sessions are controlled from the Board.

### Example calls

Read a card before acting. Use its current `card.updatedAt` and check
`allowedActions`. The list describes card state. The client still needs the
matching grant.

```json
{"name":"board_retry","arguments":{"cardId":"card-id","expectedUpdatedAt":1795021000000,"requestId":"retry-1"}}
```

Read a registered artifact by kind. Omit the version to read the latest.
Use `nextCharOffset` as `charOffset` in the next call.

```json
{"name":"board_artifacts_read","arguments":{"cardId":"card-id","kind":"plan","maxChars":1000}}
```

Use the ID from `notes_list` or `notes_create` to update an existing note.

```json
{"name":"notes_write","arguments":{"id":"note-id","body":"Updated notes","requestId":"note-edit-1"}}
```

## Retries

Every mutation takes a `requestId`. MOLFAR saves a receipt before it acts:

- The same client, project, tool, `requestId` and arguments return the original result,
  across reconnects and restarts.
- The same `requestId` with different arguments returns a conflict.
- If MOLFAR stopped while handling a call, retry with the same `requestId`.
  `sessions_start`, `sessions_stop` and `board_create` resume against the
  same session or card. `sessions_send` resumes a reserved draft and
  acknowledges an already queued or delivered prompt. If the queue stayed
  paused after an interruption, resume it in MOLFAR.
- An in-flight duplicate reports that the request is still running. If a Board
  action committed before its receipt was saved, the original revision is stale
  and recovery returns a conflict.
- A client-side timeout does not cancel accepted work; use `sessions_stop`.

## Limits

Requests are limited to 1 MiB, 32 queued and 8 running calls, a 30-second wait
for MOLFAR, 100 list entries and 6,000 characters per text page. Unknown tool
arguments, unsupported protocol versions, unknown `Host` values and any browser
`Origin` are rejected. The audit log in MOLFAR's settings keeps the last 200
calls as client, tool, target, request ID and outcome, without keys, prompts or
transcripts, note titles, tags, or bodies.

## Not included

The endpoint is loopback-only. Plan approval and editing, delivery, runtime
approvals, and model overrides remain desktop operations.
