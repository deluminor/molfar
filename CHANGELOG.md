# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- What's New lists recent releases as an accordion — current version open first, older ones collapsed with a quiet preview.

### Changed

- Jira Inbox cascade keeps parent rows aligned with flat issues: **Show subtasks** / **Hide subtasks** sits beside the timestamp, nested rows use a continuous tree rail through the list gap, denser children, a soft expanded-group wash, and no repeated project subtitle.
- Working-rail **X** closes the session tab in every card state. Finished chats dismiss immediately; a still-running turn asks before stop-and-close.

## [1.0.16] - 2026-10-17

### Added

- Working agents strip cards get a quiet **X** to stop that session without opening it (working, needs approval, and done).
- Task Board stages copy their input artifacts into the worktree's git-ignored `.molfar/board/` and list those paths in a short handoff manifest, so prompts no longer paste full artifact bodies.
- Long task descriptions and acceptance criteria on the card **Overview** collapse behind a fade with **Show more** and **Show less**.
- Home **Edit layout** can **hide and show widgets**; hidden ones sit in a strip until restored, and the arrangement persists across restarts. New **Usage**, **Inbox**, and **Activity** cards summarize plan pressure, open inbox items, and a year heatmap of session activity across all projects. **Status**, **Automations**, and **Host** highlight actionable rows, failed runs, and high load more clearly.
- The **Usage** page shows denser provider cards (limits when available, status otherwise — never a fake percent), an honest trend from daily usage snapshots, and the same session **Activity** year heatmap as Home.

### Changed

- Usage (page + Home strip) lists providers as **Claude → Codex → Cursor**, then other connected providers; disconnected ones are omitted and the grid reflows for 1–N cards.
- Home **Activity** year heatmap sizes cells and gaps to the card (ResizeObserver) with clearer empty/active contrast, capped gap rhythm, and polished month/legend chrome; Home **Usage** is a denser 2×2 provider grid with reset countdown when known.
- Fresh Home installs and **Reset** use Erik's latest DEV layout (Activity beside clock/status, equal Inbox/Sessions/Automations row, Host+Usage, shorter Matrix). Saved layouts are not force-migrated.
- Home **Inbox** pulse and **Sessions** cards show the last **10** items (compact rows with internal scroll).
- Factory glass defaults are sidebar opacity **70%**, blur **64**, and main-pane glass **on**. Existing saved appearance settings are unchanged.

### Fixed

- A broken or unfinished Home layout save keeps the previous arrangement instead of wiping it; **Reset** only leaves edit mode after the default layout is cleared. Hidden widgets stop refreshing until shown again.

## [1.0.15] - 2026-10-16

### Added

- Each Task Board agent column can pick which **skills** it runs. The column model chip auto-detects hub names (`d-grill`, `grill`, and the same pattern for the other stages), lets you toggle curated skills, add extras from the project catalog, and reset back to auto-detect. Missing skills warn on the chip and are skipped when a stage starts.
- Sessions and Familiars with app access can **list and create** Task Board cards through `board.list` and `board.create`. A session only files cards in its own project; a Familiar only in its projects. Reuse `--request-id` on retries to get the same card instead of a duplicate. The built-in `/create-board-task` skill does the same on demand.

### Changed

- Dragging cards on the Task Board uses **pointer events** with a drag ghost and edge autoscroll, so drops work reliably in the macOS desktop build instead of being swallowed by native HTML5 drag.

### Fixed

- Starting a card from Backlog again after a failed Grill no longer asks for missing later-round artifacts (`spec`, `plan`, `answers`). Fresh starts reset to grill round 1, and a stuck card whose round was already past 1 falls back to first-grill inputs when those files are gone.

## [1.0.14] - 2026-10-15

### Added

- Delivered Task Board cards can be **Archived** from the card drawer. They leave the active board and remain under the Archived filter; unfinished cards still use Reject.

### Changed

- The Board rail **waiting count** sits on the right of the row—same trailing slot as Familiar unread badges—instead of a left-side pill beside the icon. Inbox dots and Search shortcuts still use that trailing slot when there is no count.

## [1.0.13] - 2026-10-15

### Added

- A global **Task Board** on the project rail runs each card through Grill, Plan approval, Implement, Code review, Final review and Rework. Every agent stage runs in a fresh hidden session inside the card's own worktree. Stages hand off only through versioned spec, plan, report and review files; Grill and Code review leave the checkout untouched, Implement and Rework commit. Plan approval and final review always wait for you; delivery opens a pull request, squash-merges it, or keeps the branch.
- Each board column picks its **model, effort and permission mode**; cards can override them on retry, and at most three stages run at once by default. Stages use the hub skills for their job, Code review drafts the pull request description, and stage sessions appear in the project's session list.
- Cards waiting at a gate or failed surface as a **count badge** on the Board rail action and on the macOS Dock, sharing the Dock total with sessions that need input. Gate and failure events also raise a project banner that respects mute settings.
- Paired Companion phones can drive the board with **`board.*`** actions and see board attention in the overview.

## [1.0.12] - 2026-10-14

### Added

- Inbox keeps **filters per provider tab** instead of one global set, so GitHub, Jira and the other sources each remember their own filters.
- Jira issues in the inbox show an **expandable parent/child tree** with issue-type labels.
- Familiars and habit runs can create **HTML visual artifacts** with `app artifacts.write` using `kind: "html"`, alongside Markdown documents. Visuals run in a sandboxed frame, follow the app's theme, fit their content height, and refresh when revised. Scripts and public HTTPS assets load; access to the app, fetch requests, nested frames, and form submissions are blocked.
- Familiar replies show linked **local images and videos inline**, including workspace-relative references. Images open in the file viewer when clicked, videos have playback controls, and a file that cannot be displayed falls back to its link.
- The Familiar overview's Sessions tab has **search and filters** for provider, status, time, archived and unavailable sessions. Sessions appear newest first, load more pages as the list nears its end, and empty states explain what to do.
- MOLFAR **reopens the last open Familiar on launch** when it still exists and Familiars are enabled. Closing the Familiar clears that choice.
- An **Activity** tab in the Familiar overview shows a turn's work trail with a Working or Finished status; selecting a chat turn's activity opens it.
- Sessions started by a **habit run** are listed on the report it posts to the Familiar's chat, and a run that only started sessions still posts a report.
- A **sound** plays when an agent asks a question or needs approval, using the existing sound settings. From MonoCode #801.
- **Terminal hyperlinks**, including OSC 8 links, open in the default browser. From MonoCode #782.
- Project groups can be **reordered by dragging**. From MonoCode #787.
- The editor highlights **`.env`, Vue, Svelte, SCSS, Sass and Less** files. From MonoCode #915 and #892.
- Markdown and SVG files remember the last **Preview or Source** choice, including after a restart; review tabs still open in Source. From MonoCode #929.
- Settings → Keybindings lists **Escape** as the fixed shortcut that stops a busy session. From MonoCode #897.
- The compact project rail shows **instant tooltips** with diff stats and shortcuts, and the Sessions tab shows a dot when a finished reply is unseen.
- Plan **usage chips** appear in the Familiar composer.

### Changed

- A unified **Familiar overview** replaces the separate details, sessions, artifacts and changes sidebars, with Sessions, Documents, Habits, Changes and Activity tabs. It opens beside the chat by default, toggles from the title bar, starts 400 pixels wide, and resizes up to 960 pixels or 62% of the window.
- Familiar settings open in a **dialog** from the title bar, with General, Soul and Memory sections. Clicking the mascot opens the mascot and color popover, and the name field sits beneath it.
- Sessions a Familiar starts **stay out of the project sidebar** unless **Show sessions in sidebar** is turned on in that Familiar's settings, and open over the overview's session list with Back, Open in workspace and Hide overview controls.
- The overview's **Changes** tab groups repositories into project tabs, uses the repository's real Git staging area shared with the Changes panel, and opens a changed file in an inline diff editor.
- Documents and visuals open in the overview's **Documents** tab; reply cards are compact title chips with document or chart icons.
- Familiar session cards show the model's provider mark beside the branch; habits are grouped into Up next today, Done today and Later.
- The Familiar intro is an **inline rail card** with a switch to hide Familiars, instead of a one-time popover.
- New conversations show an empty context ring; the folded Changes tab icon shows a dot when there are changes; the rail unread badge uses the accent color.
- Handoff and second-opinion actions are hidden in the Familiar view, chat bubbles no longer have messaging-style tails, and the Familiar composer compacts its tools and model pills in narrow chats.
- The model picker groups models by provider for omp, Pi and Hermes, and Claude model labels are shortened to show their versions. From MonoCode #765 and #937.
- Pi and Codex show token totals for the **whole turn**, not just the last request. From MonoCode #884.
- Branch and commit menus use the shared popover.

### Fixed

- Background agent updates no longer drop pending session changes when several arrive before React renders.
- Switching Familiars clears the previous Familiar's open session, document, search and filters; session and habit lists no longer flash blank, and session and artifact cards fit narrow panes.
- Popovers opened from dialogs stay above them, and Escape closes the popover before the dialog.
- A saved Claude version shows its model settings on first open. From MonoCode #938.
- Git diffs read quoted paths literally. From MonoCode #815.
- In SSH remote projects, a session in a linked worktree diffs that worktree instead of the main checkout. From MonoCode #887.
- A session whose worktree was deleted outside the app can pick a new checkout instead of failing every turn. From MonoCode #883.
- Pi waits for asynchronously registered provider models, and omp loads extensions while probing its model catalog. From MonoCode #921 and #846.
- Punctuation-only assistant text no longer adds empty rows to the transcript. From MonoCode #763.
- A consumed handoff recap is no longer resent on every later turn. From MonoCode #880.
- The footer Terminal button toggles the terminal dock and shows its pressed state. From MonoCode #784.
- Icon buttons and tabs in the title bar and Familiar overview have consistent sizes.

## [1.0.11] - 2026-10-12

### Added

- **Devin CLI** is available as a provider for local and remote sessions on macOS, Windows, and Linux through ACP. It uses the CLI's existing sign-in on the machine running the session and supports model selection, per-model effort and fast controls, planning, resuming, cancellation, compaction, slash commands, and Devin skills. From MonoCode #748.
- Devin **subagents** appear in the existing agent cards and activity hierarchy, including nested work and child replies. Devin can generate session titles and answer `/btw` side questions; temporary side-question sessions are cleaned up after completion, failure, or cancellation. From MonoCode #748.
- Devin account details show the signed-in identity, plan, daily and weekly usage limits and reset times, and extra usage balance. Usage requests keep credentials in the backend and use HTTPS. From MonoCode #748.
- **Turn checkpoints** capture changes before and after a turn in Git workspaces, including edits made through shell commands. Settled turns show their actual diff with keep and undo controls, while preserving changes that were present before the turn.
- Familiar reviews group files by their own **Git repository or worktree**, including nested repositories. Each checkout has its own file selection and commit draft, so work across multiple repositories can be reviewed and committed separately. Files outside Git remain available for review.
- Settings → Familiars → **Pin familiars to the icon rail** places Familiar icons above the project picker when the rail is collapsed. The floating Familiar rail also shows whether each Familiar is working, idle, or waiting for input.
- Image previews and the image lightbox support **cursor-centered zoom**, modifier-wheel gestures, zoom keyboard shortcuts, and native macOS trackpad pinch gestures. The lightbox also supports dragging to pan and double-clicking to zoom or reset.
- Settings → Chat → **Autocorrect** controls native spelling and correction behavior in both regular session and Familiar composers. The preference persists across restarts and is enabled by default.
- **Video previews** open common video containers, including MP4, MOV, WebM, and MKV, in the file pane with playback controls, dimensions, duration, file size, and format. Playback depends on the platform's supported codecs; unreadable or unsupported local videos offer retry and external playback.
- Settings → Providers → Advanced → **Keep idle agents ready** controls how many finished conversations keep their agent CLI running for quick follow-ups. Choose None, 1, 2, 3, or 5; the default is 3. Excess agents stop in order of longest idle time, preserving resume state and favoring the conversation on screen. Running turns are excluded, lowering the limit takes effect immediately, and idle agents otherwise stop after three minutes instead of five.
- Familiars can answer with an **emoji reaction** attached to the user message. Reaction-only replies hide their redundant reply bubble, thinking, and tool activity while retaining errors. New reactions animate with reduced-motion support, notifications describe the reaction, and the next message stacks onto a turn that ended in only a reaction.
- Familiar rail badges show **unread reply counts**, including habit posts, instead of a single dot. Counts clear when the Familiar is opened, display up to `99+`, and are included in accessible labels.
- The Familiar composer has an **emoji picker** with search, recents, categories, and skin tones. It is bundled with the app, so it works offline, and picks insert at the cursor.
- The Familiar composer shows **model controls** beneath the input: attach and emoji on the left, the model picker, effort pills, and a context usage meter on the right.
- Sessions a Familiar launches appear as **status cards** under the reply that started them, showing live state (working, needs input, draft, failed, stopped, done) and project. Clicking a card opens that session in the Familiar's sidebar over its session list, with Back, Open in workspace, and Hide controls.

### Changed

- Streamed replies **show text as it arrives**, with a fade timed to the stream's cadence, instead of revealing it word by word. Following the bottom of a growing reply glides instead of jumping and respects the entrance animation settings.
- Sessions a Familiar launches **no longer open as workspace tabs** unless they are placed beside an open pane; open them from the Familiar's session cards or sidebar.
- Familiar commits include only the selected files' current working-copy contents and preserve unrelated staged work, including partial staging. Other existing repository changes are excluded by default, even when already staged. Generated commit context uses a temporary Git index without changing the real staging area or including unselected changes.
- Familiar artifact and changes panels use a wider reader layout. Switching repositories preserves each checkout's selection and draft, and a completed commit clears only its selected files from the Familiar review.
- A Familiar's latest turn that edited files has a compact **changes button** showing added and removed line counts and opening the diff. Ordinary sessions retain the full review card; older transcript pages, drafts, and pending inbox questions do not show an unrelated review.
- Floating macOS Familiar chats use a more compact **440-point width and up to 560-point height**, including the Familiar rail, while fitting smaller screen work areas.
- Document artifact cards are compact status chips with a check mark, title, and kind; the open action moved into the tooltip.
- Turn actions under a Familiar's reply appear on hover in a fixed gap, so revealing them no longer shifts the layout. Reaction badges are frosted chips over the message bubble's corner.
- Native browser scrollbars are hidden throughout the app while preserving horizontal and vertical scrolling. Custom editor and terminal scrollbar controls remain available.
- Large streamed Markdown code blocks reuse highlighted lines and rendered content, reducing rendering work and stalls as output grows. From MonoCode #863.
- Streamed agent output batches stdout lines and server events about once per 16-millisecond window, and foreground chat updates are limited to about 30 per second. Unchanged sidebar, live-agent, and Familiar rail data reuse their existing values, and output in other tabs avoids rerendering the visible pane tree.
- Terminal title polling reads foreground commands directly from `/proc` on Linux and skips process lookups while the shell owns the foreground. The animated terminal background caches static outlines, pauses while hidden, draws only the visible board during transitions, and pulses its cursor only on hover. The resident Quick Composer is prepared only when its shortcut is enabled.

### Fixed

- Theme changes synchronize across open windows, including the color scheme, accent, tint, and dark-theme lightness, without requiring a reload. From MonoCode #909.
- **New Window** opens a working window on Windows instead of a blank gray frame caused by creating WebView2 on the main thread. From MonoCode #908.
- Launching MOLFAR again on Windows restores the running instance and its hidden windows instead of starting another process with a duplicate tray icon. From MonoCode #905.
- **Reveal in file manager** runs off the main thread, preventing Linux from becoming unresponsive while `xdg-open` waits for the file manager to close. From MonoCode #902.
- Opening a new session from a full-screen file preview keeps the visible project selected instead of falling back to another project's session. The plus button and new-session shortcut preserve the project's provider defaults and selected worktree. From MonoCode #896.
- macOS Finder file-reference URLs resolve to the file's current path, fixing Explorer paste and composer attachments for copied files and images, including files renamed after copying. Both URL parsers reject non-local hosts before resolving a reference. From MonoCode #635.
- Familiar undo refuses to overwrite later edits, restore across a changed Git `HEAD`, or interfere with an overlapping active session. Checkpoint failures show an error instead of a stale review, and live changes are presented after the turn settles. Windows overlap checks normalize separators and canonical path prefixes while keeping sibling checkouts independent.
- Selected-file Git actions validate paths against the chosen checkout, reject directory and symlink escapes, and treat filenames literally, including wildcard, colon, and option-like names. Native and remote-host commands use the same selection rules, and repository-discovery failures remain visible.
- Devin approval responses preserve the selected permission mode instead of escalating a one-time approval to unrestricted access. **Devin's supervised mode accepts file edits automatically and requests command approval**, following the CLI's native behavior; planning denies writes. Cancellation and timeout cleanup reject leftover permission requests, and supervised configuration preserves existing comments and settings. From MonoCode #748.
- Devin effort choices follow each model's supported thought levels, and saved model-family selections and unsupported effort values resolve to valid current choices. Background catalog refreshes do not open a sign-in browser, and usage refreshes handle expired credentials and temporary network failures. From MonoCode #748.
- Cursor model discovery no longer starts a browser sign-in; it keeps existing credentials and falls back to the CLI or bundled catalog.
- Codex discovery prefers the executable resolved by the user's login shell, fixing stale versions and update banners caused by an older fixed-path installation taking precedence. From MonoCode #878.
- Opening a thought row no longer repeats its first paragraph in both the row header and expanded body. Collapsed rows retain their preview. From MonoCode #882.
- Tab and project-card reorder drags cancel when a mouse release was missed and the next pointer movement reports no held buttons, preventing a stuck drag. From MonoCode #879. A dragged tab now needs a deliberate pull below the tab bar before it targets a pane, and a fast drag keeps its drop when WebKit reports no buttons just before release.
- Markdown table columns keep a readable minimum width and top-aligned content; narrow panes scroll horizontally instead of squeezing file names into stacked text. From MonoCode #876.
- Manual wheel, pointer, keyboard, and touch scrolling consistently pause transcript following. Scrolling within nested content, including code blocks, stays independent, and layout changes or browser-clamped offsets do not incorrectly stop following.
- Session reviews retain the original checkpoint boundary across interrupted turns and continuations. Older interrupted checkpoints can recover transcript-confirmed changes for review without enabling unsafe undo. Reviews shared by overlapping sessions display only files supported by that session's successful structured edit tools.
- Committed changes disappear from the current review and stay dismissed if those files are edited again. Review cards and Familiar changes buttons share cached status, refresh after workspace changes, and ignore stale responses from an earlier turn.
- Familiar replies reveal at a bounded scroll speed, completion reports attach without shifting the transcript, and ready completion prompts are hidden while they are delivered (failed ones stay visible for retry). Sessions a Familiar reused are recovered from successful follow-up receipts.
- Returning to a hidden transcript tab does not replay the fade animation for words already shown.
- Video previews pause when their workspace tab or window is hidden, prevent hidden playback from restarting, and release their source when closed. Restoring a source after React replays effects no longer aborts loading, preventing a blank preview.
- Commit messages remain editable before files are selected or staged.
- Image zoom subscriptions handle setup failures and clean up reliably when previews close or lose their zoom scope.
- Windows checks handle native temporary-directory paths consistently. Temporary Git-context directories retain private permissions on Unix.
- Subagent mascots render at the same visual scale as neighboring line icons while keeping a fixed icon slot and stable row alignment.

## [1.0.10] - 2026-10-09

### Added

- **Connectors MCP**: when Jira is connected in Settings, harness sessions (Cursor, Grok, fx, Antigravity, Hermes) and interactive Claude receive a `molfar-connectors` MCP server with Jira + Confluence tools. Provider-local MCP configs from disk are merged in — sessions no longer wipe tools with an empty `mcpServers` list. Secrets stay in the existing vault file; Codex `config.toml` is not modified.
- **Companion**: paired phones can attach files (PDF, Markdown, text, JSON/XML, and common source) alongside photos when messaging a Familiar or a session, including when starting one. Up to six files per send, about 10 MB each. See [docs/companion.md](docs/companion.md).
- Floating Familiar chats have a **Familiar rail** for switching conversations and creating a new Familiar without closing the window. The wider window keeps the rail beside the chat, and its selection stays in sync with the macOS menu bar.
- Document artifacts open in an animated sheet inside a floating Familiar chat, with the same formatted reader and file links as the main window.
- Settings → Familiars → **Menu bar icon** can hide or restore the macOS Familiar menu bar icon. The choice survives app restarts.
- The Explorer file tree supports **keyboard navigation**: arrow keys, Home/End, and PageUp/PageDown move the selection; Right/Left enter, expand, or collapse folders; Enter opens files or toggles folders; and Space activates the selected row. Typing a filename prefix jumps to a match, repeating a letter cycles matches, and focused rows have a visible outline.
- The Familiar's live activity ticker can expand or collapse the current turn's activity directly from the reply header, with keyboard access and an expanded-state indicator.
- **OpenCode 2.x** servers are supported for local and remote sessions alongside OpenCode 1.x. Version detection selects the matching server, catalog, and event protocol, including approvals, questions, multi-select answers, compaction, cancellation, and resuming a session in its current project folder. From MonoCode #434.
- The Linux **AppImage updates itself** from Settings → General using signed release downloads. Keep it in a writable directory so it can replace itself and relaunch. `.deb` and `.rpm` installations instead show instructions for updating through apt or dnf; a feed without an AppImage update reports that no update is available. From MonoCode #825.
- The chat composer enables native **macOS spell checking**, including spelling suggestions in its context menu. Existing macOS spell-checking preferences are preserved. From MonoCode #829.
- Familiars can create persistent **document artifacts** for reports, plans, and other Markdown deliverables. Document cards appear beneath the originating reply and open a reader with formatting, file links, copy, and delete controls. Documents survive app restarts and the reader refreshes when a document is revised.
- Familiars and habit runs can use `app artifacts.list`, `artifacts.read`, and `artifacts.write` to find, read, create, or revise documents and attach them to the chat or habit report. Retrying a creation request reuses the saved document instead of creating a duplicate. Deleting a document removes its cards from saved conversations, and later saves from another window cannot restore them.
- On macOS, the **Familiars menu bar** lists each Familiar with its mascot and opens a resizable floating chat that stays above other windows and follows across Spaces. Floating chats share the main conversation, accept messages and attachments, handle approvals and questions, and offer controls to stop a reply or open the conversation in MOLFAR.
- A Familiar's **Details → Permissions** picker saves its permission mode alongside its model settings. New Familiar conversations start with **Auto** permissions.
- Familiar replies have a **Sessions** control for work launched during that turn. Its panel shows each session's provider, model, project, and current status, including requests for input, drafts, and archived sessions. Launch records survive chat restoration, so saved sessions remain accessible after their tabs close.
- Settings → Familiars adds preferences for sessions started by each Familiar: show or hide them in the project sidebar, and optionally group them in a color-coded folder named after the Familiar. Hidden sessions remain saved and can be opened from its chat; the preferences apply to newly started sessions.
- The opt-in `app` CLI adds `sessions.stop`, `sessions.archive`, and `sessions.delete` to manage another regular session in the chosen project. Stop cancels the active turn and pauses queued messages; archive saves the conversation for later restoration; delete permanently removes it. Open files, terminals, and worktrees are kept. `sessions.list` also reports archived status.
- A Familiar **Changes** panel can show session diffs and a commit tab; the commit message can be edited without selected or staged files.

### Changed

- Familiar Codex conversations retain their native context in **isolated MOLFAR storage** for the selected account, sharing its provider configuration and credentials. Existing Familiar threads migrate with their rollout files, fork dependencies, and delegated-agent state, preserving context across restarts while keeping Familiar conversation storage separate from the ordinary Codex session list.
- Familiar provider sessions rotate when reported context reaches **80%** of the model's window. Idle time and app restarts no longer trigger a rotation. A fresh session receives recent exchanges and a bounded brief of earlier work, while the full transcript remains available in the chat.
- Habits can work for **up to one hour** per run, increased from 15 minutes. Time spent waiting for an approval does not count toward that limit, and overdue runs still stop and record a failure.
- Active Familiar names use compact signature pills beside the work ticker; settled replies use lighter, muted name styling. The floating Familiar rail dims when its window loses focus.
- The macOS Familiar menu uses system-style rows, hover feedback, SF Symbols, and red styling for destructive actions.
- Zen phase live content hides scrollbars while retaining scrolling.
- Prerelease tags publish to a separate **beta updater feed**, and beta builds use that feed without changing the stable updater feed or macOS download links. AppImage releases are signed after repacking so signatures cover the distributed file. Linux dependency installation bounds APT retries. From MonoCode #825.
- Account emails are **masked by default** when no display preference has been saved. Existing choices are preserved, and Settings → Providers → Usage and privacy → **Mask account emails** controls the display.
- Familiar chats keep opening narration and intermediate progress in the activity trail, show live status beneath the Familiar's name, and reveal the final answer when work finishes. The activity control sits beside the reply actions, and copying or saving a reply uses its final answer.
- Automatic Familiar replies after delegated sessions finish continue the preceding answer with one header and one set of reply actions. A new day or a break of more than an hour starts a separate message with its own timestamp.
- Max and Ultra effort animations now apply to every provider whose effort or variant controls expose those options, including keyboard highlighting. From MonoCode #672.

### Fixed

- Scrolling settled chat history keeps the scroll range stable instead of resizing turns during a gesture. Small reversals do not restart following, directionless trackpad events do not snap the reader back, and reopening or reattaching a transcript follows the latest turn without restoring a stale offset. From MonoCode #818.
- Opening a local project preserves remote sessions instead of reusing their tabs as blank local sessions. Remote tabs are reused only for the matching project, including while their saved transcript is still loading.
- Files in the Changes list respond across the full row height and open their exact diff path without an unnecessary path-resolution request, reducing selection latency. From MonoCode #830.
- Opening a provider's model dropdown in Settings explicitly refreshes its catalog even when a live catalog is already cached, so newly available models can appear without restarting.
- Linux AppImages use the host's **WebKitGTK 4.1 and system libraries**, avoiding EGL display failures caused by bundled Ubuntu libraries on current Mesa systems. Install `libwebkit2gtk-4.1-0` on Debian/Ubuntu, `webkit2gtk4.1` on Fedora, or `webkit2gtk-4.1` on Arch. Native Wayland is supported, and `GDK_BACKEND=x11` remains available when needed. From MonoCode #824.
- Windows Codex Familiar storage creates directory junctions against canonical source paths and opens copied rollout files with write access before flushing, fixing configuration-link creation and file-sync failures.
- Temporary Grok and OpenCode text-generation sessions are deleted after completion, failure, or cancellation. Generated Codex text uses unsaved threads by default, while side questions retain resumable context. Grok cleanup accepts only valid session UUIDs.
- Replies to delivered mid-turn Familiar follow-ups appear immediately and stay visible when more tool work arrives. Queued or failed messages are not treated as delivered follow-ups, and replies already shown remain available when background work resumes.
- Familiar completion reports wait for launch acceptance, including sessions that finish before their launch is acknowledged. Rejected launches and follow-ups do not produce a second report. When a Familiar stops, archives, or deletes a monitored session, its pending or queued report is dismissed while reports for other sessions and other Familiars are retained.
- Selecting an IME candidate with Enter no longer sends a Familiar message or submits the memory fact, Familiar name, or new habit name fields prematurely on WebKit. From MonoCode #790.
- Codex turns can start before a model has been explicitly selected. The adapter omits the collaboration-mode override until a model is known, allowing Codex to use the thread's selected model without rejecting a null model setting. From MonoCode #771.
- Notes created without a title receive a title-based filename slug when title editing finishes or the editor closes, instead of retaining an `untitled` slug. Later title edits discard stale finalization requests, and existing or user-chosen slugs stay stable. From MonoCode #788.
- **⌘W / Ctrl+W** closes the active project-dock terminal and **⌘T / Ctrl+T** adds a dock terminal while that dock has keyboard focus. Elsewhere the shortcuts retain their workspace behavior, and macOS New Tab and Close Tab menu actions affect only the focused window. From MonoCode #774.
- Settings refreshes live provider model catalogs even when built-in fallback models are already present, fixing stale Pi and Antigravity model lists after restart. From MonoCode #783.

## [1.0.9] - 2026-10-09

### Added

- **Connectors MCP**: when Jira is connected in Settings, harness sessions (Cursor, Grok, fx, Antigravity, Hermes) and interactive Claude receive a `molfar-connectors` MCP server with Jira + Confluence tools. Provider-local MCP configs from disk are merged in — sessions no longer wipe tools with an empty `mcpServers` list. Secrets stay in the existing vault file; Codex `config.toml` is not modified.
- **Companion**: paired phones can attach files (PDF, Markdown, text, JSON/XML, and common source) alongside photos when messaging a Familiar or a session, including when starting one. Up to six files per send, about 10 MB each. See [docs/companion.md](docs/companion.md).
- Floating Familiar chats have a **Familiar rail** for switching conversations and creating a new Familiar without closing the window. The wider window keeps the rail beside the chat, and its selection stays in sync with the macOS menu bar.
- Document artifacts open in an animated sheet inside a floating Familiar chat, with the same formatted reader and file links as the main window.
- Settings → Familiars → **Menu bar icon** can hide or restore the macOS Familiar menu bar icon. The choice survives app restarts.
- The Explorer file tree supports **keyboard navigation**: arrow keys, Home/End, and PageUp/PageDown move the selection; Right/Left enter, expand, or collapse folders; Enter opens files or toggles folders; and Space activates the selected row. Typing a filename prefix jumps to a match, repeating a letter cycles matches, and focused rows have a visible outline.
- The Familiar's live activity ticker can expand or collapse the current turn's activity directly from the reply header, with keyboard access and an expanded-state indicator.
- **OpenCode 2.x** servers are supported for local and remote sessions alongside OpenCode 1.x. Version detection selects the matching server, catalog, and event protocol, including approvals, questions, multi-select answers, compaction, cancellation, and resuming a session in its current project folder. From MonoCode #434.
- The Linux **AppImage updates itself** from Settings → General using signed release downloads. Keep it in a writable directory so it can replace itself and relaunch. `.deb` and `.rpm` installations instead show instructions for updating through apt or dnf; a feed without an AppImage update reports that no update is available. From MonoCode #825.
- The chat composer enables native **macOS spell checking**, including spelling suggestions in its context menu. Existing macOS spell-checking preferences are preserved. From MonoCode #829.
- Familiars can create persistent **document artifacts** for reports, plans, and other Markdown deliverables. Document cards appear beneath the originating reply and open a reader with formatting, file links, copy, and delete controls. Documents survive app restarts and the reader refreshes when a document is revised.
- Familiars and habit runs can use `app artifacts.list`, `artifacts.read`, and `artifacts.write` to find, read, create, or revise documents and attach them to the chat or habit report. Retrying a creation request reuses the saved document instead of creating a duplicate. Deleting a document removes its cards from saved conversations, and later saves from another window cannot restore them.
- On macOS, the **Familiars menu bar** lists each Familiar with its mascot and opens a resizable floating chat that stays above other windows and follows across Spaces. Floating chats share the main conversation, accept messages and attachments, handle approvals and questions, and offer controls to stop a reply or open the conversation in MOLFAR.
- A Familiar's **Details → Permissions** picker saves its permission mode alongside its model settings. New Familiar conversations start with **Auto** permissions.
- Familiar replies have a **Sessions** control for work launched during that turn. Its panel shows each session's provider, model, project, and current status, including requests for input, drafts, and archived sessions. Launch records survive chat restoration, so saved sessions remain accessible after their tabs close.
- Settings → Familiars adds preferences for sessions started by each Familiar: show or hide them in the project sidebar, and optionally group them in a color-coded folder named after the Familiar. Hidden sessions remain saved and can be opened from its chat; the preferences apply to newly started sessions.
- The opt-in `app` CLI adds `sessions.stop`, `sessions.archive`, and `sessions.delete` to manage another regular session in the chosen project. Stop cancels the active turn and pauses queued messages; archive saves the conversation for later restoration; delete permanently removes it. Open files, terminals, and worktrees are kept. `sessions.list` also reports archived status.
- A Familiar **Changes** panel can show session diffs and a commit tab; the commit message can be edited without selected or staged files.

### Changed

- Familiar Codex conversations retain their native context in **isolated MOLFAR storage** for the selected account, sharing its provider configuration and credentials. Existing Familiar threads migrate with their rollout files, fork dependencies, and delegated-agent state, preserving context across restarts while keeping Familiar conversation storage separate from the ordinary Codex session list.
- Familiar provider sessions rotate when reported context reaches **80%** of the model's window. Idle time and app restarts no longer trigger a rotation. A fresh session receives recent exchanges and a bounded brief of earlier work, while the full transcript remains available in the chat.
- Habits can work for **up to one hour** per run, increased from 15 minutes. Time spent waiting for an approval does not count toward that limit, and overdue runs still stop and record a failure.
- Active Familiar names use compact signature pills beside the work ticker; settled replies use lighter, muted name styling. The floating Familiar rail dims when its window loses focus.
- The macOS Familiar menu uses system-style rows, hover feedback, SF Symbols, and red styling for destructive actions.
- Zen phase live content hides scrollbars while retaining scrolling.
- Prerelease tags publish to a separate **beta updater feed**, and beta builds use that feed without changing the stable updater feed or macOS download links. AppImage releases are signed after repacking so signatures cover the distributed file. Linux dependency installation bounds APT retries. From MonoCode #825.
- Account emails are **masked by default** when no display preference has been saved. Existing choices are preserved, and Settings → Providers → Usage and privacy → **Mask account emails** controls the display.
- Familiar chats keep opening narration and intermediate progress in the activity trail, show live status beneath the Familiar's name, and reveal the final answer when work finishes. The activity control sits beside the reply actions, and copying or saving a reply uses its final answer.
- Automatic Familiar replies after delegated sessions finish continue the preceding answer with one header and one set of reply actions. A new day or a break of more than an hour starts a separate message with its own timestamp.
- Max and Ultra effort animations now apply to every provider whose effort or variant controls expose those options, including keyboard highlighting. From MonoCode #672.

### Fixed

- Scrolling settled chat history keeps the scroll range stable instead of resizing turns during a gesture. Small reversals do not restart following, directionless trackpad events do not snap the reader back, and reopening or reattaching a transcript follows the latest turn without restoring a stale offset. From MonoCode #818.
- Opening a local project preserves remote sessions instead of reusing their tabs as blank local sessions. Remote tabs are reused only for the matching project, including while their saved transcript is still loading.
- Files in the Changes list respond across the full row height and open their exact diff path without an unnecessary path-resolution request, reducing selection latency. From MonoCode #830.
- Opening a provider's model dropdown in Settings explicitly refreshes its catalog even when a live catalog is already cached, so newly available models can appear without restarting.
- Linux AppImages use the host's **WebKitGTK 4.1 and system libraries**, avoiding EGL display failures caused by bundled Ubuntu libraries on current Mesa systems. Install `libwebkit2gtk-4.1-0` on Debian/Ubuntu, `webkit2gtk4.1` on Fedora, or `webkit2gtk-4.1` on Arch. Native Wayland is supported, and `GDK_BACKEND=x11` remains available when needed. From MonoCode #824.
- Windows Codex Familiar storage creates directory junctions against canonical source paths and opens copied rollout files with write access before flushing, fixing configuration-link creation and file-sync failures.
- Temporary Grok and OpenCode text-generation sessions are deleted after completion, failure, or cancellation. Generated Codex text uses unsaved threads by default, while side questions retain resumable context. Grok cleanup accepts only valid session UUIDs.
- Replies to delivered mid-turn Familiar follow-ups appear immediately and stay visible when more tool work arrives. Queued or failed messages are not treated as delivered follow-ups, and replies already shown remain available when background work resumes.
- Familiar completion reports wait for launch acceptance, including sessions that finish before their launch is acknowledged. Rejected launches and follow-ups do not produce a second report. When a Familiar stops, archives, or deletes a monitored session, its pending or queued report is dismissed while reports for other sessions and other Familiars are retained.
- Selecting an IME candidate with Enter no longer sends a Familiar message or submits the memory fact, Familiar name, or new habit name fields prematurely on WebKit. From MonoCode #790.
- Codex turns can start before a model has been explicitly selected. The adapter omits the collaboration-mode override until a model is known, allowing Codex to use the thread's selected model without rejecting a null model setting. From MonoCode #771.
- Notes created without a title receive a title-based filename slug when title editing finishes or the editor closes, instead of retaining an `untitled` slug. Later title edits discard stale finalization requests, and existing or user-chosen slugs stay stable. From MonoCode #788.
- **⌘W / Ctrl+W** closes the active project-dock terminal and **⌘T / Ctrl+T** adds a dock terminal while that dock has keyboard focus. Elsewhere the shortcuts retain their workspace behavior, and macOS New Tab and Close Tab menu actions affect only the focused window. From MonoCode #774.
- Settings refreshes live provider model catalogs even when built-in fallback models are already present, fixing stale Pi and Antigravity model lists after restart. From MonoCode #783.

## [1.0.8] - 2026-10-08

### Added

- **Companion**: paired phones can save edits to Knowledge vault notes, with revision checks so a stale overwrite is rejected. Open sessions on the phone overview include last-updated times so chats sort and group by recency within each project.

## [1.0.7] - 2026-10-08

### Added

- **Companion**: the phone overview **Open sessions** list now includes recent chats from visited project history on the desktop, not only tabs currently open in memory. Live sessions win when both sources list the same chat; the list is capped at 50 so a large history does not crowd the phone.

## [1.0.6] - 2026-10-07

### Changed

- **Home** host metrics keep a longer sample history (150 points instead of 60), so CPU/memory charts retain more recent activity.
- **Companion** pairing offer stacks the QR code and instructions in one column and centers the setup steps for clearer layout on narrow Settings panes.

## [1.0.5] - 2026-10-07

### Added

- **Companion**: pair a phone or iPad with this desktop over Tailscale (Settings → Companion, QR code) to follow Familiars and open sessions, send messages and photos, answer approvals and questions, switch permission modes, start new sessions, browse the Knowledge vault, and read or add notes while MOLFAR runs. The gateway is off by default, binds only loopback or the Tailscale address, and stores only hashes of per-device tokens. See [docs/companion.md](docs/companion.md).

## [1.0.4] - 2026-10-07

### Changed

- Renamed **Monos** to **Familiars** across the product, code, and docs (MOLFAR branding for the upstream Mono agents feature). Existing localStorage keys, the `monos/` data folder, and SQLite `mono_*` transcript tables migrate automatically on first use.

## [1.0.3] - 2026-10-07

### Added

- **Monos** are persistent agents on the project rail, each with its own conversation and assigned projects. Create and reorder them, choose a name, animated pixel mascot, color, and chat background, and return to the same conversation across app restarts. Monos also appear in the project picker; Settings → Monos can hide them or reset a Familiar's name and standing instructions. In MonoCode #773.
- A Familiar's **Details** panel brings together its provider, model, model settings, and assigned projects, with separate **Soul**, **Memory**, and **Habits** pages. Soul holds editable Markdown standing instructions in `SOUL.md`; the Familiar can update them when asked. Resetting a conversation clears its messages while keeping its soul, memory, and habits. In MonoCode #773.
- Mono memory carries dated facts and preferences across conversations and provider changes. Add, edit, and forget facts in the Memory page or ask the Familiar to manage them; topic notes and an archive keep older detail searchable without loading everything into each turn. Soul and memory files live in the app's data folder, and concurrent edits preserve unsaved drafts and retry against the latest contents instead of overwriting another writer's changes. Common credential formats are redacted from facts saved through the app CLI. In MonoCode #773.
- **Habits** run recurring tasks hourly, daily, on weekdays, or weekly in local time while MOLFAR is open. Create them in Details or through the Mono, pause or resume them, run them immediately, and inspect their latest 20 outcomes, reports, errors, and durations. Suggested habit cards wait for the user to start them. In MonoCode #773.
- Habit runs work in separate background sessions with full tool access, post useful findings to the Familiar's chat, and stay quiet when there is nothing to report. Provider approval requests appear in the chat. Runs execute one at a time, are claimed across windows to prevent duplicates, and skip schedules missed by more than two hours; working-time and unanswered-approval limits stop stalled runs. In MonoCode #773.
- Monos can use the local `app` CLI to read, start, draft, and message sessions, manage worktrees and folders, and read or write notes across their assigned projects. Delegated sessions start in the background and notify the Familiar when they finish; work launched in the same turn returns as one batch, including failures and cancellations, for a consolidated report once the Familiar is idle. In MonoCode #773.
- The opt-in `app` CLI adds `notes.write` to create notes or update their title, Markdown body, and tags. Created notes retain their source session, and retrying a creation request does not duplicate the note. In MonoCode #773.
- Mono chats support live pull request and session cards, clickable reply choices, and habit suggestions through `app chat.card`. Pull request and session cards reflect their current state and open the associated work. Habit reports can include the same cards. In MonoCode #773.
- Mono chats accept follow-up messages while an answer is streaming, show them immediately as stable bubbles, and deliver them in order once the provider is ready. Failed sends remain available for retry, saved outboxes retain attachments, quotes populate the draft, and files can be dropped anywhere on the chat. Questions keep the input, draft, and attachments in place. In MonoCode #773.
- Mono tool activity folds into a compact work summary with a live status and a separate chronological activity panel. Pending approvals remain actionable, completed reports have response controls, images appear above message bubbles, and emoji-only messages appear enlarged. New messages and chat growth animate with reduced-motion support. In MonoCode #773.
- Mono usage-limit notices can resume work manually or at the reset time, switch to another model or provider, or choose another saved account. Recovery preserves the conversation and continues pending work without adding a duplicate continuation. In MonoCode #773.
- Long Familiar conversations retain their full transcript in storage, load older pages on demand, and support search across archived and live messages while output streams. The provider session refreshes when context grows too large or after a sufficiently long break, carrying recent exchanges and a bounded brief of earlier work without an extra model summarization call. In MonoCode #773.
- Codex asynchronous agent questions appear in the shared question panel alongside server requests. Answers steer the active turn, with retry handling if the turn changes during delivery and cleanup when it ends or is canceled.
- The sidebar working-copy switcher can search by branch or path and select a checkout with the arrow keys and Enter. Entering a name with no matches offers to create a worktree from the selected checkout's `HEAD`, then switches to it, with progress and errors shown in the picker.
- Folder rows in the Changes panel's tree view can stage or unstage all changes beneath that folder, including in remote projects. File and folder mutation actions are disabled while another change is in progress, and affected diffs refresh when it completes.
- The question panel has a **Back** button to revisit and edit earlier answers before submitting, preserving selected options and free-text responses. In MonoCode #688.
- GitHub pull request and issue views in the Inbox have an activity timeline that interleaves comments, reviews, and commits chronologically, groups consecutive commits by author, and lets long comments expand on demand. Linked work item panels add expandable description summaries; pull request panels also list changed files with counts and links to each file's diff.
- Settings → Appearance → **Diff colors** offers Default, Colorblind (blue/orange) and High contrast (blue/orange with stronger tints and text) palettes. They apply to the diff view, the editor's git gutter, tool-call previews, change counts and added/deleted file status in the file tree and changes panel. In MonoCode #707.

### Changed

- Visible agent output flushes with animation frames, while background and hidden-window sessions update on a separate, slower cadence. Switching tabs catches up visible panes without forcing hidden streams to repaint; approvals and questions still appear immediately and in order.
- Worktree file indexes survive tab switches and refresh when resumed instead of rebuilding on every return. Hidden Explorer views retain their state, and sidebar updates avoid work for unchanged sessions.
- Transcript rendering reuses unchanged turns and panes, reducing repeated processing during streaming. Jump-to-latest visibility updates without rerendering the entire session pane.
- GitHub Inbox background refreshes run every two minutes while visible and every five minutes while hidden or in the tray, and cached Inbox lists remain fresh for two minutes. Linked session badges reuse those results instead of fetching each historical work item separately, and repeated focus changes respect the polling interval.
- Pull request checks load when a GitHub PR opens, but ongoing checks polling runs only while its **Checks** tab is visible.
- Notes and Mono soul editing share the Markdown source editor with syntax highlighting and line numbers.
- Workspace search and new-session actions live in the sidebar header in both expanded and compact layouts.
- Quick Composer has a dedicated permissions picker beside the model selector, and its project picker is in the composer header.
- Long title-bar and file-pane tab labels fade at their clipped edge. The fade appears only when text overflows and updates as tabs resize.
- The session sidebar and transcripts above a docked composer fade at the bottom edge, with extra scroll space so the last session and latest reply can scroll fully into view.
- Newly created sidebar sessions fade in and push existing rows down; session title updates have a sweep and particle effect. Opening a project or reordering existing sessions does not replay the insertion animation. Both effects respect reduced-motion preferences.
- New split panes slide in from the edge where they were added, while linked work item panels slide in from the right and reveal their content together. These animations respect reduced-motion preferences.
- Linked GitHub work items preload when hovering their sidebar links. GitHub Inbox details, discussions, and diffs reuse recent cached results and share in-flight requests, reducing repeat API calls and delays when opening a panel.
- New agent output reveals at a steady pace from its first chunk, including replies that finish before their first paint. Incoming chunks no longer restart the reveal timing; saved replies and output received in a hidden tab appear immediately when opened.
- Added and removed lines show a `+`/`-` marker in the diff view and in the editor's git gutter, so they no longer depend on red/green color alone. Diff colors are now theme tokens with separate light-theme values, which also improves the contrast of light-theme gutter line numbers. In MonoCode #707.

### Fixed

- Transcript scrolling preserves the reader's position when streaming output, resizes, or observer callbacks arrive before a delayed scroll event. Small upward movements pause following, and following resumes only after reaching the transcript end.
- Notes autosave keeps empty or spaced title drafts intact while the title field is focused, while continuing to save body edits and non-empty titles. Title normalization waits until blur or editor teardown. In MonoCode #769; fixes MonoCode #768.
- Remote-session polling no longer interrupts IME composition in the composer or causes Enter intended to select a candidate to send the message. In MonoCode #741.
- **New Terminal**, **New Terminal Tab**, and the first project-dock terminal open in the active session's worktree even when a pane from another checkout has focus. Removed worktrees are excluded, and sessions without a worktree keep the focused pane's directory behavior. In MonoCode #732; fixes MonoCode #697.
- Terminal font selection prefers JetBrainsMono Nerd Font Mono and includes common Nerd Font fallbacks, allowing installed prompt icon glyphs to render on WebKit. The terminal font stack survives production CSS generation. In MonoCode #767.
- Skill discovery accepts up to 5,000 skills across its roots instead of stopping at 300, making larger personal catalogs available in Settings, filtering, and the composer slash picker. In MonoCode #750; fixes MonoCode #168.
- Pi extension status updates replace one row per status key within the current turn instead of appending a row on every update. Empty status text removes the row, and the next turn starts a new one. In MonoCode #760.
- Pi and omp GitHub Copilot model catalogs exclude internal agent models and legacy GPT-3.5/4 snapshots that Copilot omits from its own picker. In MonoCode #766.
- macOS glass tint paints natively during window resizing and stays in sync with the appearance color and opacity. CSS tint remains available when native tint cannot be confirmed, avoiding doubled opacity.
- Modal panels render above their backdrops, with solid light-theme backgrounds and clearer title styling.
- The **Open folder on a machine** dialog no longer darkens the entire window, keeping its light-theme panel and surrounding content from turning gray. Clicking outside still cancels it. In MonoCode #733.
- In the editor's diff view, the `+`/`-` marker sits between the line numbers and the code instead of at the far left of the gutter. Changed rows tint their line numbers, removed lines show their old line number, and each changed line has one color cue instead of two bars, matching the unified diff view. The gutter reserves enough space for the original file's line numbers. In MonoCode #759.
- The Inbox pull request overview's change counts and per-file bars follow the selected diff color palette instead of fixed red and green. In MonoCode #759.
- GitHub reads back off after primary or secondary API rate limits instead of repeatedly retrying. The Inbox keeps its last GitHub snapshot visible during refresh failures while other providers can continue updating, and reads recover after the backoff expires.
- Switching providers after a usage limit uses the saved transcript recap instead of requesting another response from the exhausted provider. Switching accounts starts a fresh thread for the selected account while preserving the conversation. In MonoCode #773.
- Queued messages wait while a worktree is being prepared or has been removed instead of dispatching into an unavailable checkout. In MonoCode #773.
- Sessions started through the `app` CLI inherit the source session's worktree only when they target the same project. Explicit worktree selections are validated against the chosen project. In MonoCode #773.
- Transcript scrolling keeps the reader's place when earlier turns resize together or composer resizing temporarily changes the viewport. Layout changes and queued scroll events no longer resume paused following, and scrolling inside a code block no longer interrupts transcript following.
- File and image drops work after the composer becomes ready or switches providers, with correct drop coordinates on Windows and Retina Macs. Sending waits for dropped attachments to finish reading; stale reads after a draft reset or unmount are discarded. Duplicate native/browser drop events attach a file once, browser image items are accepted even without a populated file list, and unreadable or missing files show an error.
- Staging and unstaging treat file and folder paths literally, so names containing wildcard characters or Git pathspec syntax cannot affect unrelated paths, locally or on a remote host.
- Markdown and SVG files opened for Git review default to source mode so their changes are visible in the editor. Review tabs remember their view mode separately from ordinary file tabs. In MonoCode #660.
- The model search receives focus after its flyout becomes visible, including both the Models submenu and the picker opened beside the current model. In MonoCode #670.
- The composer model picker keeps long model names on one line instead of truncating them.
- Explorer file names no longer clip the bottoms of letters such as `g`. In MonoCode #678.
- Sidebar diff statistics scale to the available width and refit when the sidebar is resized.
- The provider usage chip, its tooltip, and usage cards update immediately when **Show remaining usage** changes. Remaining percentages are calculated from clamped usage values.
- Session history shows live title and linked-work-item updates before the next save. Pending agent events are applied before submitting or steering a message, keeping received output before the new user message and checking the latest session state.
- Pi's model catalog includes models registered by extensions. In MonoCode #645.
- Remote hosts detect the Pi coding agent installed via npm by resolving its launcher and checking the enclosing package manifest. In MonoCode #687; fixes MonoCode #673.
- Merge request diffs load on older self-hosted GitLab instances by falling back to the legacy changes endpoint when the newer endpoint is unavailable. Permission and connection errors still surface normally, and incomplete diffs are marked as truncated. In MonoCode #723.

## [1.0.2] - 2026-10-05

### Changed

- **Brand:** darker app icon — glowing reptile eye with a fibrous iris on a near-black tile, one comet orbit and a faint astrolabe ring; reads clearly in the Dock at small sizes. The macOS asset catalog (`Assets.car`) is rebuilt so the Dock picks it up.

## [1.0.1] - 2026-10-04

### Changed

- **Brand:** new app icon — geometric eye with slit pupil and two diagonal comet orbits (replaces the purple planet mark).

## [1.0.0] - 2026-10-04

First release under the MOLFAR name (Multi-Agent Orchestration Layer for Autonomous Reasoning): a local-first engineering workspace for coding agents, code, knowledge, worktrees, and automation.

### Added

- **Sessions** for Claude Code, Codex, Cursor, Grok Build, OpenCode, Antigravity, Pi, omp, fx and Hermes Agent, each driven through the provider CLI installed on the machine. Every run picks its provider, model, reasoning effort, permission mode and checkout (current branch or an isolated Git worktree), with attachments, `@` mentions for files, notes and Confluence pages, and slash commands.
- **Workspace** around the conversation: file tree and CodeMirror editor, integrated terminal, source control with history, staging, commits, pull requests and worktrees, and project-scoped Markdown notes.
- **Inbox** for GitHub, GitLab, Linear, Jira, Azure DevOps and Confluence, with **Ask**, **Send to chat**, and CI repair sessions for failing GitHub checks. Confluence Docs browse spaces and page trees and render ADF as Markdown.
- **Automations** on a schedule or on GitHub, GitLab, Linear, Jira and Azure DevOps events, running locally with the same providers and permission modes as interactive sessions.
- **Orchestration** with lead/worker runs, and **`/operator`** app access that lets the active agent work with models, sessions, folders, notes, worktrees and read-only Confluence tools.
- **Knowledge** for local Obsidian vaults: tree, search, 3D link graph, Source/Preview editing and explicit **Add to agent context**.
- **Home** dashboard with host metrics, status, recent sessions and automation runs, and **Usage** cards for Claude, Codex, Cursor and Antigravity quotas.
- Animated **Sphere** brand visual on Home, alongside Fire and Orb.
- Experimental remote sessions over SSH through MOLFAR Host.

### Changed

- New name, logo and app identity (`com.molfar.desktop`). MOLFAR keeps its own settings, sessions and host directory (`~/.molfar-host`); earlier Vatra and MonoCode profiles are not imported.

[Unreleased]: https://github.com/deluminor/molfar/compare/v1.0.16...HEAD
[1.0.16]: https://github.com/deluminor/molfar/compare/v1.0.15...v1.0.16
[1.0.15]: https://github.com/deluminor/molfar/compare/v1.0.14...v1.0.15
[1.0.14]: https://github.com/deluminor/molfar/compare/v1.0.13...v1.0.14
[1.0.13]: https://github.com/deluminor/molfar/compare/v1.0.12...v1.0.13
[1.0.12]: https://github.com/deluminor/molfar/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/deluminor/molfar/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/deluminor/molfar/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/deluminor/molfar/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/deluminor/molfar/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/deluminor/molfar/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/deluminor/molfar/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/deluminor/molfar/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/deluminor/molfar/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/deluminor/molfar/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/deluminor/molfar/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/deluminor/molfar/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/deluminor/molfar/releases/tag/v1.0.0
