# Companion (phone and tablet)

The Companion gateway lets a paired phone or iPad follow and steer this desktop while MOLFAR is running: Familiars and their conversations, open project sessions, new sessions, approvals and clarifying questions, permission modes, notes, and the Knowledge vault. The client is the **Molfar** module of the BitChain iOS app.

Nothing runs when the laptop sleeps or MOLFAR is closed. The phone then shows the last overview it saw and says the laptop is asleep.

## How it connects

```
iPhone / iPad (BitChain) ──Tailscale──▶ https://<mac>.<tailnet>.ts.net ──tailscale serve──▶ 127.0.0.1:3775
                                                                                              │
                                                              companion.rs (Rust, tiny_http)  │
                                                                     │ molfar-companion-request
                                                                     ▼
                                                     main window: useCompanionBridge → executor
```

- **No LAN or internet listener.** The gateway binds loopback (`serve` mode) or the machine's Tailscale `100.x` address (`tailnet` mode). It never binds a wildcard address.
- **Tailscale Serve (recommended).** Run `tailscale serve --bg 3775` once. Tailscale terminates HTTPS with a real certificate for the machine's `.ts.net` name and forwards only tailnet traffic to the loopback port. HTTPS certificates must be enabled for the tailnet (Tailscale admin console → DNS → HTTPS Certificates).
- **Tailnet address.** Plain HTTP inside the WireGuard tunnel, for tailnets without HTTPS certificates.
- The phone talks to the laptop directly. The BitChain API is not involved and no conversation leaves the tailnet.

## Pairing

1. **Settings → Companion → Turn on.**
2. **Pair a device** shows a QR code, the URL, and an 8-character code valid for five minutes.
3. Scan it with the iPhone camera (it opens `bitchain://molfar/pair?...`) or from BitChain → Molfar → Pair. The code can also be typed by hand.

A pairing code works once. Five wrong codes close the pairing window. The device receives a 256-bit token. MOLFAR stores only its SHA-256 hash in `companion.json` in the app data directory (mode 0600 on Unix). **Remove** next to a device revokes it at once; the phone then asks to pair again.

BitChain keeps the token in the iOS Keychain (this device only) and asks for Face ID (or the passcode) before the module opens, because a paired phone can run agents with full access.

## What a paired device can do

| RPC action                                   | Effect                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `overview`                                   | Familiars (mascot, color, status, last line), open sessions, rail projects |
| `familiar.transcript` / `session.transcript` | Recent blocks; `ifRevision` returns `{ unchanged }` when nothing changed   |
| `familiar.send` / `session.send`             | Text and up to six JPEG/PNG/WebP/GIF photos, through the desktop composer  |
| `approval.respond`                           | Allow or deny a pending approval, including habit approvals                |
| `question.answer`                            | Answer or skip a clarifying question                                       |
| `session.mode`                               | Switch to any of the four permission modes                                 |
| `session.stop`                               | Stop the current turn                                                      |
| `session.options`                            | Installed providers, their models and efforts, and the project's defaults  |
| `session.start`                              | Start a session in a rail project (provider, model, effort, mode, worktree) |
| `vault.index` / `vault.read`                 | List the connected Obsidian vault and read a note with links and backlinks |
| `notes.list` / `notes.read` / `notes.create` | Search, read, and add MOLFAR notes                                         |

`GET /v1/host` returns the same CPU, memory and load figures as Home. `GET /v1/hello` answers without a token and reveals only that this is MOLFAR and its protocol version.

Habit runs, orchestration workers and Inbox asks are never exposed. Requests are executed by the main window with the same submit, approval and question paths as the desktop UI, so a message from the phone appears in the desktop transcript like any other.

The protocol lives in `src/features/companion/model/protocol.ts`. Bump `COMPANION_PROTOCOL_VERSION` (and `PROTOCOL_VERSION` in `companion.rs`) when a field changes meaning or disappears; adding optional fields does not need a bump.

## New sessions and Knowledge

`session.start` builds the same launch as the `app` CLI's `sessions.start`: one of the rail's projects, an installed provider, a known model and effort, any of the four permission modes, and the current checkout or a new worktree. The session starts in the background without taking focus on the desktop and appears in Open sessions.

`vault.index` lists up to 5,000 notes of the vault connected in Knowledge. `vault.read` returns one note (capped at 128 KiB, like **Add to agent context**), the links that resolve to other notes, and its backlinks. Both reuse the desktop's scanner; one snapshot is kept for a minute. The phone can only read the vault.

## Limits

- Request bodies: 8 KiB for pairing, 64 MiB for RPCs (photos travel as base64). Each photo is capped at about 10 MB.
- At most 32 RPCs in flight; each waits up to 30 s for the main window.
- At most 16 paired devices.
- The phone polls: every 1.2 s while a turn runs, 4 s otherwise, 5 s for the overview, and 20 s while the laptop is unreachable. Polling stops while BitChain is in the background.

## Not yet

Editing vault notes from the phone, full-text vault search, file attachments other than photos, and push notifications (Apple Personal Team builds cannot sign Push Notifications).
