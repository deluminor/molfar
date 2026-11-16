# Spec — Native stage-run timeline (task-v2)

## Goal and authority

Add a compact swimlane preview immediately above the preserved vertical stage-run history in Overview > Stages. Both remain visible together. Expand timeline opens the detailed Native modal. Task-v2 supersedes replacement wording in historical handoffs; those ignored artifacts remain untouched.

## Architecture and scope

Use existing StageRun data, the retained Timeline entity, pure interval geometry, lifecycle clock, native modal/focus facilities and existing session events. Preserve vertical attempts, status/elapsed labels, harness/model metadata, full multiline errors and Usage. No view toggle, React/Tauri changes, dependencies, schema changes or telemetry.

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

## Risks and verification

Stale card actions require identity filtering and immediate modal dismissal. Shared clock must preserve focus and scroll. Test tiny bars, missing sessions/completions, invalid timestamps, long errors and 30+ runs. Native automated tests and build are required; direct runtime verification remains a separate acceptance requirement.
