# External MCP access

MOLFAR Native can expose a local MCP endpoint so a client on the same Mac, such
as OpenBot, can hand over agreed work and read its results. MOLFAR stays the
owner of execution: models, harness defaults, runtime approvals and Board stages
are never controlled through this endpoint.

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
5. Grant the client one or more projects and scopes:
   - `read` lists projects, sessions and Board cards and reads results.
   - `submit` starts sessions, sends follow-ups and adds Backlog cards.
   - `stop` stops a running turn.

   Scopes are independent: a client that submits work needs `read` to follow
   its result. Changes apply to the next call; **Revoke** rejects the key at once,
   including on connections the client keeps open.

## Configure OpenBot

Add an HTTP (Streamable HTTP) MCP server with the URL above and an
`Authorization` header with the value `Bearer <key>`. Use OpenBot's own secure
header storage. Never put the key in the URL, a prompt or a shared file.

## Tools

| Tool | Scope | Purpose |
| --- | --- | --- |
| `projects_list` | read | Granted projects that are still on the MOLFAR rail |
| `sessions_list` | read | A project's sessions with `status` |
| `sessions_read` | read | Status and up to three recent exchanges, with paging |
| `sessions_start` | submit | Start a session with MOLFAR's default harness, model and runtime |
| `sessions_send` | submit | Follow up on an idle session |
| `sessions_stop` | stop | Stop a running turn; history is kept |
| `board_list` | read | Board cards in granted projects |
| `board_read` | read | Card state, runs, artifact versions, Grill questions and an artifact page |
| `board_create` | submit | One idle Backlog card and its task artifact; no stage starts |

Session `status` is `idle`, `running`, `needs-input`, `completed`, `failed` or
`cancelled`. `needs-input` means an approval or question waits in MOLFAR; the
endpoint cannot answer it. Board stage sessions are controlled from the Board.

## Retries

Every mutation takes a `requestId`. MOLFAR saves a receipt before it acts:

- The same client, tool, `requestId` and arguments return the original result,
  across reconnects and restarts.
- The same `requestId` with different arguments returns a conflict.
- If MOLFAR stopped while handling a call, retry with the same `requestId`.
  `sessions_start`, `sessions_stop` and `board_create` resume against the
  same session or card. `sessions_send` resumes a reserved draft and
  acknowledges an already queued or delivered prompt. If the queue stayed
  paused after an interruption, resume it in MOLFAR.
- A client-side timeout does not cancel accepted work; use `sessions_stop`.

## Limits

Requests are limited to 1 MiB, 32 queued and 8 running calls, a 30-second wait
for MOLFAR, 100 list entries and 6,000 characters per text page. Unknown tool
arguments, unsupported protocol versions, unknown `Host` values and any browser
`Origin` are rejected. The audit log in MOLFAR's settings keeps the last 200
calls as client, tool, target, request ID and outcome, without keys, prompts or
transcripts.

## Not included

OAuth, remote or network access, background daemons, automatic wakeups, Board
stage or approval controls, model selection and destructive tools.
