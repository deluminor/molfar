# MOLFAR Native preview

MOLFAR Native is an experimental Rust/GPUI application. The regular MOLFAR
React/Tauri application remains the production release.

## Included

- Native provider sessions, transcript, file editor, terminal and Git/worktree surfaces.
- Board planning, execution/review/rework, delivery controls and kanban presentation.
- Home with ten widgets, editable layouts, Usage and an interactive sphere.
- Companion gateway for BitChain text conversations and native session controls.

## Preview limits

- Full Jira, Confluence and Knowledge/Obsidian parity remains unfinished.
- Companion attachments, Knowledge and phone Board actions are unsupported.
- Current phone, provider, restart/recovery and platform acceptance remain open.
- Separate application identities do not isolate shared desktop-data storage.
  Avoid simultaneous Tauri/native use with active scheduling or phone gateways
  until coexistence acceptance is complete. Only one gateway can bind a port.
- Native automatic updates are unconfigured. Install previews manually.
- Windows and Linux packages are unsigned. macOS packages are ad-hoc signed and
  not notarized, so the first launch needs **Open Anyway** in System Settings.
  Validation artifacts are for CI only.

See the migration status and preview limitations shipped in the source tree.
Release preparation and automated tests do not establish full runtime parity.
