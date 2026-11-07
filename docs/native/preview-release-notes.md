# MOLFAR Native

MOLFAR Native is an experimental Rust and GPUI application. The React/Tauri app remains the production release. Native previews use their own version line, `0.16.0-preview.N`. They do not bump the desktop `1.0.x` changelog.

## Since 0.16.0-preview.1

### Explorer and panes

- The file tree keeps its scroll position when you expand, collapse, or refresh a folder.
- Each pane header has **Split right** and **Split down**. A terminal pane opens a fresh shell in that direction. A chat or Familiar opens a new session with its provider.
- Dragging a pane divider snaps it within 12 pixels of the midpoint between its two panes, or of an even split of the whole group, and draws an accent line while it is snapped. Double-click the divider to place it at the midpoint of those two panes. A drag more than 12 pixels from a snap spot follows the pointer.

## 0.16.0-preview.1

Published on 2026-11-06. This is the first MOLFAR Native package (`native-v0.16.0-preview.1`).

### Workspace

- Native provider sessions, transcript, file editor, terminal, and Git and worktree surfaces.
- **Settings → General → Terminal** offers **Bottom**, **Side panel**, or **Title bar**. A previous side-panel choice is kept. Side-panel placement uses the Focused layout. Title-bar terminals are for local projects. With Title bar selected, **Cmd/Ctrl+J** opens a fresh terminal tab, and the title-strip plus button offers New Session or New Terminal.
- **Split Terminal Right** (app menu and **Cmd/Ctrl+Shift+J**) opens a shell beside the focused pane in Title bar placement. In Bottom or Side panel placement it adds a terminal there.
- Dragging the last terminal out of the side panel into a split or title tab keeps the panel open with a fresh shell. The original shell moves with its running commands.
- Closing a terminal pane or title tab asks for confirmation when a foreground process is running. Bulk closes list those terminals together. Cancel leaves the tabs open. Idle shells close without a prompt.
- **Close All** and **Close Others** keep pinned tabs, matching the tab menu.
- A title tab that contains a chat with a saved draft shows a dashed border, including chats inside split tabs.
- A new split chat uses the selected provider's model, account, preferred effort, and default access mode, and keeps its working-copy scope.

### Composers, sidebar, and settings

- Session composers start one line tall and grow with the message. Transcript text lines up with the composer. Clicking the toolbar keeps the input focused.
- Familiar chats use the same composer layout and action button as sessions. Model, model settings, and access controls sit in the toolbar. Attachment and emoji controls stay beneath it, with the context meter under the action button.
- An amber bolt on model controls shows when a supported model's fast mode is on, including Familiar chats and Quick Composer.
- The Focused sidebar has a **New** row, a live **Notes** count, and a compact **Search** button beside Sidebar options. New is highlighted while an empty chat is open.
- A collapsed sidebar peeks in the boxy Focused layout and the rounded layout when you hover the left edge or the sidebar toggle. Glass blur eases with the slide.
- Settings keeps **Search** at the top of its navigation and **Back to app** at the bottom.

### Claude sign-in and resumed replies

- On Unix, quitting the app and cleaning up a provider give the process time to finish credential writes before a forceful stop. This covers Claude Code signing out when a rotating refresh token was saved to the macOS Keychain.
- Claude model catalogs are cached for six hours. A CLI update clears every account's catalog, and Claude reloads the catalog for the account in use.
- An expired Claude access token that has a refresh token keeps the last usage reading instead of asking you to sign in again. Usage updates after the CLI renews the token on its next run. A cleared macOS Keychain login shows Sign in, even when an old credentials file remains.
- A browser sign-in that is waiting can be cancelled from the usage footer or the add-account editor. Returning to the app gives an unfinished login a short grace period, then resets it.
- Resuming a Claude session no longer lets a replayed background-task notification end the real turn early or leave a stale usage-limit error.

### Rendering

- Streaming reply updates share the animation clock's redraws while it is running.
- macOS windows keep retrying an outstanding frame request after a display-link stall. Hidden windows stay stopped.
- Screenshot-thumbnail drops no longer use a two-buffer Metal layer that could block the main thread.
- GPUI warnings and macOS repaint diagnostics go to `~/Library/Logs/MOLFAR Native/gpui.log`.
- `MOLFAR_FRAME_LOG` records opt-in frame counts, draw times, main-thread CPU on macOS, view reuse, redraw origins, transcript measurement time, and text-shaping counts. See the [performance guide](../../scripts/perf/README.md).

### Board, Home, and phone

- **Board** can browse cards, edit tasks, run Grill through delivery, and move cards on a kanban board, including drag between columns. Live provider runs and GitHub delivery acceptance are open.
- **Home** has ten widgets, an editable layout, Usage, and the sphere.
- The desktop companion gateway accepts validated phone calls. The phone composer stays editable while the desktop reconnects: Send and Stop wait for the connection, and a session error waits until the desktop is back. The phone app itself ships separately. Installing this desktop preview does not update the phone.

### Limits

- Jira, Confluence, and Knowledge do not have full native parity.
- Companion attachments, Knowledge, and phone Board actions are unsupported.
- Phone, provider, restart, and platform acceptance remain open.
- Native and Tauri can select the same desktop database. Do not run both against that database with an active schedule or phone gateway. One gateway can bind a port.
- Native automatic updates are unconfigured. Install previews by hand.
- Windows and Linux packages are unsigned. macOS packages are ad-hoc signed and not notarized, so the first launch needs **Open Anyway** in System Settings.
- Automated tests do not establish full runtime parity. Read [preview limitations](parity.md).

**Data.** A release build uses your existing MOLFAR database and writes changes there. Back up that data with the app closed before you try a preview. Native preferences are stored separately.

**Updates.** Settings → General → About checks for a native preview. Production Tauri releases use their own feed. If an install fails, download the new package by hand.
