# Additive native timeline rework plan

## Goal

Implement task-v2's thirteen acceptance criteria in GPUI Native. This revision supersedes the replacement composition in the historical native spec and plan; those files remain preserved as history.

## Technical approach

Reuse the retained Timeline entity, shared Rust interval geometry, native lane metadata, status/elapsed presentation, session events and native modal surface. Render a bounded compact preview first and the preserved vertical history immediately below. Expand opens a window-scoped native dialog using the same clock and normalized data.

## Execution stages

1. Add a regression for preview-before-history composition, simultaneous presence and expansion/dismissal. Restore additive composition without removing history metadata, errors or session controls.
2. Add the detailed native modal, focus containment/restoration, accessible controls and session dismissal. Preserve scrolling and clock identity.
3. Implement validated/unavailable intervals and pointer/keyboard inspection with persistent selection, full local timestamps/timezone and errors. Synchronize stale selection, pending/failed loads and visibility cleanup.
4. Cover narrow windows, long content, thirty-plus runs, status/geometry boundaries and lifecycle interactions with GPUI tests. Run native checks and the native app build. The user verifies the built app directly, including keyboard, sessions, scrolling and reduced motion; manual verification does not block implementation-stage completion.

## Risks and verification

At the start of rework, the implementation satisfied the older seven-criterion replacement spec rather than the expanded task-v2 contract. Do not infer completion from earlier green checks. Preserve historical artifacts, do not change React/Tauri or schemas, and report every unimplemented criterion and unrun runtime check explicitly.

The supplied Board spec-v5 and plan-v5 now record the corrected additive requirements and verification ownership. Historical spec-v4/plan-v4 remain preserved; no further publication correction is required for this rework.

## Verification ownership update

The user explicitly retained direct UI verification. This rework completes code, automated Native checks and the Native app build. The user performs the manual runtime acceptance checklist; the agent does not claim that manual verification occurred.
