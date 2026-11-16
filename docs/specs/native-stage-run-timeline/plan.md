# Plan — GPUI Native stage-run timeline

## Goal

Replace the native Overview’s vertical stage-run list with a live swimlane timeline while preserving session navigation, errors, and existing data contracts.

## Technical Approach

Use native GPUI elements and an independently owned timeline entity. Keep geometry and duration calculations pure and clock-injected for deterministic tests.

Reuse existing native stage labels, icons, model presentation, card-status helpers, session events, and theme tokens. Translate the existing web timeline’s interval behavior and `elapsedLabel` semantics into Rust; do not import web UI or alter the general-purpose `usage::duration`.

Organize the existing `detail/timeline.rs` implementation into a `detail/timeline/` concern folder. Proposed files:

- `mod.rs`: entity state, input synchronization, and integration interface.
- `types.rs`: timeline input and normalized layout types.
- `constants.rs`: tick interval and minimum domain.
- `layout.rs`: interval normalization, ordering, domain, and bar fractions.
- `elapsed.rs`: elapsed-label formatting.
- `status.rs`: run-status presentation.
- `view.rs`: header, axis, and lane composition.
- `lane.rs`: run metadata, bar, errors, and session controls.
- `clock.rs`: retained task and clock lifecycle.
- `tests/`: geometry, formatting, rendering, navigation, and lifecycle coverage.

Split further only when the file-size ceiling requires it.

## Architecture Overview

1. Board snapshots remain the source of card and run data.
2. Overview passes matching card data and runs to a persistent timeline entity.
3. The timeline normalizes intervals using a supplied `now`.
4. Rendering uses common-axis fractions and native controls.
5. Timeline session events are forwarded to `Board::Event::OpenSession`.
6. A retained timer notifies only the timeline entity while visible and clock-dependent.
7. Selection, snapshot refresh, detail closure, and tab changes synchronize timeline inputs and timer eligibility.

Retain the timeline entity across ordinary refreshes. Reset card-specific state on identity changes. A clock tick performs no database refresh.

## Risks & Mitigations

- **Formatting drift:** use explicit parity fixtures for `<1m`, minute boundaries, exact hours, and durations beyond one day.
- **Timer leaks or redraw flicker:** use an owned GPUI task, explicit visibility eligibility, and entity-identity tests.
- **Stale selections:** synchronize from matching snapshots and test switching cards while a tick is pending.
- **Inaccessible short bars:** keep metadata and a keyboard-accessible open control outside bar geometry.
- **Lost errors:** render error text persistently and test long multiline content.
- **Overflow:** normalize with safe arithmetic and assert finite, bounded layout fractions.
- **Misleading terminal records:** preserve their status and display a missing-completion notice.
- **Moving scale:** test the common-axis domain as well as individual bar widths, including single-running-run cases.

## Execution Stages

### Stage 1 — Deterministic interval and presentation model

- [ ] Create `detail/timeline/{types,constants,layout,elapsed,status}.rs` and model tests.
- [ ] Normalize each interval using the documented endpoint rule.
- [ ] Preserve stable chronological order, gaps, overlaps, and run identity.
- [ ] Calculate total elapsed and safe normalized coordinates with a one-minute minimum domain.
- [ ] Add status mappings using lifecycle constants and existing native tones.
- [ ] Implement native elapsed formatting matching web `elapsedLabel`.

Checkpoint: pure tests cover repeated attempts, equal timestamps, overlap, gaps, zero/reversed intervals, missing completions, extreme timestamps, all supported statuses, unknown statuses, and formatting boundaries.

Coverage: AC-1, AC-5, AC-7.

### Stage 2 — Native swimlane replacement and navigation

- [ ] Replace `detail/timeline.rs` with `detail/timeline/{mod,view,lane}.rs`.
- [ ] Update `detail/mod.rs` and `detail/metadata.rs` to integrate the entity.
- [ ] Render total elapsed, current-card status, shared axis, lanes, metadata, and empty state.
- [ ] Preserve stable `board-run-*` and `board-run-open-*` selectors where practical.
- [ ] Forward bar and open-control activation through the existing session event.
- [ ] Preserve errors and all session/model information.
- [ ] Extend or relocate `detail/timeline_tests.rs` into the timeline test concern.
- [ ] Keep chart overflow within the drawer; preserve surrounding Usage and artifact content.

Checkpoint: native GPUI tests verify lane count, attempt labels, bar placement, error visibility, no-session behavior, correct session IDs, keyboard activation, empty state, and narrow-detail layout.

Coverage: AC-1, AC-3, AC-4, AC-5, AC-6, AC-7.

### Stage 3 — Live clock and lifecycle integration

- [ ] Add `detail/timeline/clock.rs` with a retained one-second GPUI task.
- [ ] Synchronize visibility and selected-card identity through existing Board detail lifecycle paths in `task_board/mod.rs`, `load.rs`, `detail/tabs.rs`, and selection/closure handlers.
- [ ] Start ticking only when visible and an interval lacks completion.
- [ ] Stop on hiding, completion, or release; resample immediately on reopening.
- [ ] Ensure ticks update the timeline entity without reconstructing the Board or detail previews.
- [ ] Add deterministic executor-driven lifecycle tests.

Checkpoint: tests advance time, observe geometry/domain changes, preserve entity identity and focus, freeze completed intervals, reject stale-card inputs, and verify timer shutdown/restart.

Coverage: AC-2 and missing-completion behavior in AC-1/AC-6.

### Stage 4 — Verification and final review

- [ ] Run targeted layout, formatting, status, navigation, and timer tests first.
- [ ] Run `npm run native:check`, the repository’s native formatting, Clippy, development-script, core-test, and GPUI-test gate.
- [ ] Review the final diff for schema changes, telemetry, dependency additions, accidental web changes, attribution, and scope creep.
- [ ] Check every acceptance criterion against its evidence.
- [ ] Report executed checks, failures, environment blockers, and unrun runtime QA separately.

Checkpoint: native gate passes or each blocker has precise evidence. Unit tests or compilation alone do not establish runtime visual parity. No browser or interactive UI QA is authorized by this planning request.

Coverage: AC-1 through AC-7.

## Testing Strategy

### Pure unit tests

- Two sequential runs with a gap and two overlapping runs.
- Repeated stages and attempts; stable equal-start ordering.
- Single running run and mixed running/completed runs.
- Zero, reversed, and extreme timestamp intervals.
- Terminal runs without completion timestamps.
- Duration boundaries: negative, zero, 59,999 ms, 60,000 ms, 59 minutes, 60 minutes, 125 minutes, and more than 24 hours.
- Required statuses, partial, redirected, queued, and unknown fallback.

### Native GPUI integration tests

Use existing `gpui::test`, `TestAppContext`, `VisualTestContext`, debug selectors, and session-event subscription patterns.

Verify lane bounds against shared-axis positions, metadata and error content, tiny-bar controls, exact session selection, no-session controls, and keyboard activation. Preserve the current selected-attempt session regression.

### Clock tests

Inject time and advance the GPUI test executor. Verify:

- An unfinished bar changes width when another completed interval fixes the axis extent.
- A single running run advances total elapsed and the axis even when its fitted width remains constant.
- Completed intervals stop changing.
- Missing-completion terminal runs retain terminal labels.
- Closing, tab switching, card switching, release, and completion stop stale updates.
- Reopening samples fresh time.
- Timeline, Board, and description-preview identities remain stable during ticks.

## Acceptance Traceability

- AC-1: Stages 1–2; interval fixtures and native lane-bound assertions.
- AC-2: Stage 3; clock advancement, identity, and lifecycle tests.
- AC-3: Stage 2; bar/control activation and exact-session event assertions.
- AC-4: Stage 2; empty-state test without an axis.
- AC-5: Stages 1–2; elapsed parity, run-status fixtures, and current-card summary assertions.
- AC-6: Stages 2–3; errors, attempts, navigation, narrow-layout, and stale-input tests.
- AC-7: Stages 1–4; unchanged contracts and final diff review.

## Analyze Gate

PASS for the draft artifacts: seven acceptance criteria map to four execution stages and explicit tests. No uncovered requirements, orphan stages, contradictions, or unresolved product decisions remain.

Constitution check: the plan preserves native boundaries, existing contracts, direct module imports, cohesive files, and meaningful regression coverage. The stage-specific read-only contract overrides artifact persistence and task initialization.

Implementation remains subject to the board’s approval workflow. No implementation, tests, or runtime QA ran during this planning stage.