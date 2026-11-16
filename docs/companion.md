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

- **No LAN or internet listener.** The Companion gateway binds loopback (`serve` mode) or the machine's Tailscale `100.x` address (`tailnet` mode). It never binds a wildcard address.
- **Tailscale Serve (recommended).** Run `tailscale serve --bg 3775` once. Tailscale terminates HTTPS with a real certificate for the machine's `.ts.net` name and forwards only tailnet traffic to the loopback port. HTTPS certificates must be enabled for the tailnet (Tailscale admin console → DNS → HTTPS Certificates).
- **Tailnet address.** Plain HTTP inside the WireGuard tunnel, for tailnets without HTTPS certificates.
- The phone talks to the laptop directly. The BitChain API is not involved and no conversation leaves the tailnet.

## Phone pairing vs. Companion

MOLFAR has two separate ways to reach the desktop from a phone. They share no code, settings or pairings, and both are **off by default**.

|  | Companion | Phone pairing |
| --- | --- | --- |
| Settings | **Settings → Companion** | **Settings → Connections → Your phones** |
| Client | Molfar module of the BitChain iOS app | MOLFAR mobile app in `mobile/` (Expo; not published yet, build it yourself) |
| Origin | MOLFAR | MonoCode upstream (0.16.0) |
| Listens on | TCP `127.0.0.1:3775` (`serve` mode, behind `tailscale serve`) or the Tailscale `100.x` address (`tailnet` mode). Never a wildcard address | UDP `[::]:38416` (QUIC), every interface including the LAN, IPv4 and IPv6 |
| Reachable from | Your tailnet only | Your LAN and any VPN the desktop is on (Tailscale included). MOLFAR never opens it on the router; a global IPv6 address is reachable only if the router lets inbound IPv6 through |
| Listening starts | **Turn on** | The first **Pair phone** |
| Transport security | HTTPS from Tailscale Serve, or WireGuard inside the tailnet; bearer token per device | QUIC with mutually authenticated TLS 1.3. The QR code pins the desktop's certificate; the desktop admits only certificates of paired phones and of the open invitation |
| Pairing secret | 8-character code, five minutes, one use; 256-bit token, stored hashed in `companion.json` | QR code, 15 minutes, one use, carrying a one-time invitation identity; the phone proves its own key against it. Desktop identity in the OS keyring (`com.molfar.mobile`), paired fingerprints in `mobile-access.json` |
| Revoke a device | **Remove** next to the device | **Remove** next to the phone; its requests and watches are refused at once |
| Turn it off | **Turn off** | Remove every paired phone (closing an unused code also stops the listener) |
| What the phone can do | The RPC actions below | Browse projects and conversations, start, steer, stop, rename, archive and delete sessions, switch model and permission mode, browse files, view diffs, run git actions (stage, commit, push, create PR) |

### Phone pairing security model

- **No listener until you pair.** The UDP socket opens when you press **Pair phone** and closes when the code is closed with no phone paired, or when the last phone is removed. While a phone stays paired, it reopens each time MOLFAR starts. If MOLFAR quits while a code is on screen, the listener also reopens at the next start, but admits no one until you pair (the code is gone).
- **The LAN can reach the port, not the workspace.** Anyone on the same network or VPN can send packets to `38416`, but the TLS handshake fails unless the client presents a paired phone's certificate or the open invitation's (TLS 1.3 only, ALPN `molfar-mobile/1`). A paired phone has workspace access, so treat the QR code like a password while it is on screen.
- **No router port mapping.** Upstream MonoCode can open the port on the router with UPnP/NAT-PMP ("Open the router port automatically", on by default there), which exposes the listener to the internet. MOLFAR removed that option, its code and its crates (`igd-next`, `natpmp`, `attohttpc`), and a test fails if they return. To use a paired phone away from home, put the phone and the desktop on Tailscale (or another VPN) and enter the desktop's `100.x` or MagicDNS name under **Connect away from home → Remote address** before making the code. Forwarding UDP `38416` on the router yourself is possible, but not recommended.
- **IPv6.** The pairing code lists every non-loopback address of the desktop, including global IPv6 addresses. Most home routers drop unsolicited inbound IPv6; if yours does not, the port is reachable from the internet, still behind the TLS gate above. Block inbound UDP `38416` in the router or the desktop firewall if that matters to you.
- **Compared with Companion.** Companion never binds a LAN address. Phone pairing does once a phone is paired, because the phone connects directly over Wi-Fi. If the desktop must not be reachable from the LAN, use Companion and leave phone pairing unpaired, or block UDP `38416` in the firewall.

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
| `familiar.send` / `session.send`             | Text, up to six JPEG/PNG/WebP/GIF photos, and/or up to six files (see Limits), through the desktop composer |
| `approval.respond`                           | Allow or deny a pending approval, including habit approvals                |
| `question.answer`                            | Answer or skip a clarifying question                                       |
| `session.mode`                               | Switch to any of the four permission modes                                 |
| `session.stop`                               | Stop the current turn                                                      |
| `session.options`                            | Installed providers, their models and efforts, and the project's defaults  |
| `session.start`                              | Start a session in a rail project (provider, model, effort, mode, worktree) |
| `vault.index` / `vault.read`                 | List the connected Obsidian vault and read a note with links and backlinks |
| `notes.list` / `notes.read` / `notes.create` | Search, read, and add MOLFAR notes                                         |

`GET /v1/host` returns the same CPU, memory and load figures as Home. `GET /v1/hello` answers without a token and reveals only that this is MOLFAR and its protocol version.

Habit runs, orchestration workers, Inbox asks and Task Board stage sessions are never exposed through these actions. Requests are executed by the main window with the same submit, approval and question paths as the desktop UI, so a message from the phone appears in the desktop transcript like any other.

The protocol lives in `src/features/companion/model/protocol.ts`. Bump `COMPANION_PROTOCOL_VERSION` (and `PROTOCOL_VERSION` in `companion.rs`) when a field changes meaning or disappears; adding optional fields does not need a bump.

Overview `sessions` include optional `updatedAt` (ms epoch) so the phone can group open sessions by day per project. Older desktops omit it; clients fall back to a flat list.

## New sessions and Knowledge

`session.start` builds the same launch as the `app` CLI's `sessions.start`: one of the rail's projects, an installed provider, a known model and effort, any of the four permission modes, and the current checkout or a new worktree. The session starts in the background without taking focus on the desktop and appears in Open sessions.

`vault.index` lists up to 5,000 notes of the vault connected in Knowledge. `vault.read` returns one note (capped at 128 KiB, like **Add to agent context**), the links that resolve to other notes, its backlinks, and a revision for concurrency. `vault.write` saves an edited body when `ifRevision` still matches the on-disk note. Index and read reuse the desktop's scanner; one snapshot is kept for a minute.

## Task Board

When the board engine runs on this desktop, `overview` carries `capabilities: ["board"]` and `boardAttention`, the number of cards waiting on the user (a plan or final-review gate, a failed stage, or a pending approval or question).

| RPC action       | Effect                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `board.list`     | Cards with column, run state, `needsYou`, `stalled`, counters and `updatedAt`; `project`, `archived` filters |
| `board.card`     | One card: fields, `legalMoves`, stage runs, artifact list with the latest body of each kind, diff file stats; `diffFile` adds that file's patch |
| `board.artifact` | An older artifact version's body (`id`, `kind`, `version`)                                        |
| `board.create`   | A new Backlog card in a rail project                                                             |
| `board.move`     | Drag-and-drop: moves that need no input (`start`, `approvePlan`, `back`); others answer `needs_input` |
| `board.action`   | Every gate action: `start`, `answer`, `requestChanges`, `approvePlan`, `rework`, `deliver`, `retry`, `back`, `cancel`, `reject` |
| `board.session`  | `op` `transcript` / `approval` / `answer` for one of the card's stage runs (`id`, `runId`)        |

`board.move` and `board.action` require `ifUpdatedAt`, the card's `updatedAt` as last read; a stale value fails with `conflict:`. Board errors start with a code (`invalid_input`, `not_found`, `conflict`, `illegal_transition`, `needs_input`) followed by a colon. The full client contract lives in the Task Board spec (`docs/specs/task-board/companion-contract.md`, local).

## Limits

- Request bodies: 8 KiB for pairing, 64 MiB for RPCs (photos and files travel as base64). Each photo or file is capped at about 10 MB of base64.
- `images`: at most 6; JPEG, PNG, WebP, GIF only. Shape: `{ name, mimeType, data }` (base64).
- `files`: at most 6 on the same RPCs that accept `images` (`familiar.send`, `session.send`, `session.start`). Same shape as images. Allowlist: `application/pdf`; `text/plain`, `text/markdown`, `text/csv`, `text/html`, `text/xml`; `application/json`, `application/xml`; and common source files when `mimeType` is `text/*` or `application/*` and the name ends in `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `py`, `rs`, `go`, `swift`, `java`, `kt`, `c`, `h`, `cpp`, `hpp`, `cs`, `rb`, `php`, `sh`, `sql`, `yaml`, `yml`, `toml`, `md`, `css`, or `scss`. Video and audio are rejected. Mapped to desktop attachments with `kind: "file"`. Text may be empty when photos or files are present.
- At most 32 RPCs in flight; each waits up to 30 s for the main window.
- At most 16 paired devices.
- The phone polls: every 1.2 s while a turn runs, 4 s otherwise, 5 s for the overview, and 20 s while the laptop is unreachable. Polling stops while BitChain is in the background.

## Not yet

Full-text vault search and push notifications (Apple Personal Team builds cannot sign Push Notifications).
