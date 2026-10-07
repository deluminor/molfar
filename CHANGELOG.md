# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Monos** are persistent agents on the project rail, each with its own conversation and assigned projects. Create and reorder them, choose a name, animated pixel mascot, color, and chat background, and return to the same conversation across app restarts. Monos also appear in the project picker; Settings → Monos can hide them or reset a Mono's name and standing instructions. In MonoCode #773.
- A Mono's **Details** panel brings together its provider, model, model settings, and assigned projects, with separate **Soul**, **Memory**, and **Habits** pages. Soul holds editable Markdown standing instructions in `SOUL.md`; the Mono can update them when asked. Resetting a conversation clears its messages while keeping its soul, memory, and habits. In MonoCode #773.
- Mono memory carries dated facts and preferences across conversations and provider changes. Add, edit, and forget facts in the Memory page or ask the Mono to manage them; topic notes and an archive keep older detail searchable without loading everything into each turn. Soul and memory files live in the app's data folder, and concurrent edits preserve unsaved drafts and retry against the latest contents instead of overwriting another writer's changes. Common credential formats are redacted from facts saved through the app CLI. In MonoCode #773.
- **Habits** run recurring tasks hourly, daily, on weekdays, or weekly in local time while MOLFAR is open. Create them in Details or through the Mono, pause or resume them, run them immediately, and inspect their latest 20 outcomes, reports, errors, and durations. Suggested habit cards wait for the user to start them. In MonoCode #773.
- Habit runs work in separate background sessions with full tool access, post useful findings to the Mono's chat, and stay quiet when there is nothing to report. Provider approval requests appear in the chat. Runs execute one at a time, are claimed across windows to prevent duplicates, and skip schedules missed by more than two hours; working-time and unanswered-approval limits stop stalled runs. In MonoCode #773.
- Monos can use the local `app` CLI to read, start, draft, and message sessions, manage worktrees and folders, and read or write notes across their assigned projects. Delegated sessions start in the background and notify the Mono when they finish; work launched in the same turn returns as one batch, including failures and cancellations, for a consolidated report once the Mono is idle. In MonoCode #773.
- The opt-in `app` CLI adds `notes.write` to create notes or update their title, Markdown body, and tags. Created notes retain their source session, and retrying a creation request does not duplicate the note. In MonoCode #773.
- Mono chats support live pull request and session cards, clickable reply choices, and habit suggestions through `app chat.card`. Pull request and session cards reflect their current state and open the associated work. Habit reports can include the same cards. In MonoCode #773.
- Mono chats accept follow-up messages while an answer is streaming, show them immediately as stable bubbles, and deliver them in order once the provider is ready. Failed sends remain available for retry, saved outboxes retain attachments, quotes populate the draft, and files can be dropped anywhere on the chat. Questions keep the input, draft, and attachments in place. In MonoCode #773.
- Mono tool activity folds into a compact work summary with a live status and a separate chronological activity panel. Pending approvals remain actionable, completed reports have response controls, images appear above message bubbles, and emoji-only messages appear enlarged. New messages and chat growth animate with reduced-motion support. In MonoCode #773.
- Mono usage-limit notices can resume work manually or at the reset time, switch to another model or provider, or choose another saved account. Recovery preserves the conversation and continues pending work without adding a duplicate continuation. In MonoCode #773.
- Long Mono conversations retain their full transcript in storage, load older pages on demand, and support search across archived and live messages while output streams. The provider session refreshes when context grows too large or after a sufficiently long break, carrying recent exchanges and a bounded brief of earlier work without an extra model summarization call. In MonoCode #773.
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

[Unreleased]: https://github.com/deluminor/molfar/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/deluminor/molfar/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/deluminor/molfar/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/deluminor/molfar/releases/tag/v1.0.0
