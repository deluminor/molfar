# #7 Task Board: GPUI Native stage-run timeline in card detail

- Project: /Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar
- Base branch: main

## Description

### Required composition

Keep BOTH views visible in the Native Stages section: the new compact swimlane timeline FIRST, then the existing vertical stage list immediately BELOW it. The timeline is additive. Do not replace, remove, hide, or put the vertical history behind a view toggle. Expand timeline opens the detailed Native modal. This requirement supersedes replacement wording in historical task-v1, spec-v4 and plan-v4; those spec/plan artifacts require correction before acceptance.

### Overview

Implement the stage-run swimlane timeline in MOLFAR Native (Rust/GPUI). All new MOLFAR features target GPUI Native only; React/Tauri is retired and is not an implementation or acceptance target.

Reopened because PR #147 implemented the timeline in React/Tauri only. The installed GPUI app still renders the vertical stage history without the preview or expanded timeline. The merged PR is historical reference, not delivery of this Native feature.

In Board > card detail > Overview > Stages, add a compact horizontal timeline preview above the existing vertical history, with an Expand timeline control opening a native GPUI modal. Show chronological runs and retries on a shared time axis, including gaps and overlaps. Preserve the existing vertical history, session links, status labels, errors and Usage section.

Reuse existing StageRun data and GPUI theme, modal, focus, scrolling, session navigation and elapsed-time helpers. The Native entry points are crates/molfar-gpui/src/task_board/detail/timeline.rs and detail/metadata.rs. Extract interval geometry into a pure Rust model shared by preview and expanded view. No webview, React components, new telemetry or dependency is required.

### Delivery and verification

Start with a fresh GPUI-specific Grill and plan against the current main branch. Previous React plans and passing web tests do not establish GPUI implementation or runtime parity. Preserve previous runs and artifacts as history. Do not restart implementation automatically as part of reopening this card.

Delivery requires Native tests/checks, a successful Native app build, and direct runtime verification in that GPUI app that the preview and modal are visible and usable. Record the tested commit/build and any unrun checks explicitly. Do not mark Done based only on React/web gates or source presence.

Cost/token/context metrics, activity waveforms and a board-wide Gantt remain outside this feature; preserve existing Usage UI.

## Acceptance criteria

AC-1: In the GPUI Native app, Board > card detail > Overview > Stages shows a compact timeline preview immediately above the preserved vertical run history and an accessible Expand timeline control.

AC-2: Expand timeline opens a native GPUI modal with chronological rows for every stage run and retry, stage/attempt labels, harness/model metadata, status and a common relative time axis. Gaps, overlaps and short or zero-duration runs remain understandable.

AC-3: Preview and modal share validated interval bounds and total elapsed calculation from existing StageRun timestamps. Invalid/nonfinite/reversed timestamps show an unavailable state rather than broken geometry; missing completion times remain explicitly identified.

AC-4: One lifecycle-scoped live clock updates all displayed open intervals, elapsed labels and details consistently. Completed geometry stays fixed; ticks preserve focus, selection and scroll position and do not replay entrance animation. Stop the clock when the view no longer needs it.

AC-5: Status has readable text plus distinct presentation for all Native run statuses, including running, succeeded, failed, cancelled, interrupted, partial/continued and redirected/sent back.

AC-6: Activating a run session action opens exactly that run's session and closes the expanded modal. Short bars have a separate usable session action. Runs without sessions remain inspectable without a broken link.

AC-7: Pointer and keyboard inspection expose stage, attempt, status, harness, model, local timestamps/timezone, duration, unavailable completion data and complete multiline errors. Selected details remain available independently of transient hover/focus inspection.

AC-8: Preserve vertical history, per-run sessions, errors and existing Usage data. Cards without runs show one clear empty state without broken axes.

AC-9: Escape, backdrop dismissal, initial focus, focus containment/restoration and keyboard navigation work through existing Native conventions. Transient inspection dismisses when focus leaves its trigger/surface; persistent selected details remain intact.

AC-10: Card switch, close, Overview departure and pending or failed replacement loads immediately dismiss stale modal/inspection and session actions. No previous-card data remains actionable.

AC-11: Preview fits a narrow detail panel; the expanded modal fits small windows and contains its own scrolling. Long labels, long errors and 30+ runs remain usable. Motion respects reduced motion; hover changes bar appearance without painting the lane background or restarting geometry animations.

AC-12: Pure Rust geometry tests and GPUI behavioral tests cover malformed/empty data, retries, gaps/overlaps, live/completed runs, session navigation, focus/inspection and stale-card cleanup. Run npm run native:check and npm run native:build; record actual results. Verify preview, modal, scrolling, keyboard/session behavior and reduced motion in the built GPUI app before acceptance.

AC-13: Implementation and acceptance target Rust/GPUI Native only. No React/Tauri work, webview fallback, StageRun schema changes, harness telemetry, new dependencies or board-wide Gantt is required. PR #147 and web tests alone cannot satisfy this card.