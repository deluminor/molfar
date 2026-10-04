# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2026-10-04

### Fixed

- **test:** raise Windows vitest timeouts for git fixtures (#41)

## [1.0.1] - 2026-10-04

### Changed

- **brand:** consolidate visuals and support legacy worktrees

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
[1.0.2]: https://github.com/deluminor/molfar/releases/tag/v1.0.2
[1.0.1]: https://github.com/deluminor/molfar/releases/tag/v1.0.1
[1.0.0]: https://github.com/deluminor/molfar/releases/tag/v1.0.0
