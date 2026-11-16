---
pr_title: "feat(task-board): add native stage-run swimlane timeline"
---
# Spec — GPUI Native stage-run timeline

## Problem

The native card-detail Overview displays stage runs as a vertical list. The user cannot compare stage durations, gaps, overlaps, or repeated attempts on a common time axis.

Replace that list with a horizontal swimlane timeline using existing card data.

## Repository evidence

- Native entry point: `crates/molfar-gpui/src/task_board/detail/timeline.rs`.
- Overview integration: `detail/metadata.rs`.
- Existing session-link regression: `detail/timeline_tests.rs`.
- Data contract: `crates/molfar-core/src/task_board/types.rs`, `StageRun`.
- Native presentation helpers: `task_board/kanban/look.rs`, `kanban/status.rs`, and `controls::model_label`.
- The web implementation under `src/features/task-board/model/stage-timeline/` provides reusable behavioral reference.
- Native `usage::duration` differs from web `elapsedLabel`; preserving AC-5 requires a dedicated native equivalent of the latter.

The working checkout matches the supplied branch and base commit. Initial and final Git status were clean.

## Scope and settled defaults

- Implement the timeline in native GPUI, inside Overview’s existing Stages section.
- Use one row per run, including separate rows for repeated stages. Show `attempt N` when the attempt exceeds one.
- Use a shared horizontal elapsed-time axis, chronological row ordering, and stable run-ID identity.
- Show stage name, status, duration, harness, friendly model name, errors, and session-opening control.
- Show total elapsed and the current card’s overall status above the chart.
- Keep metadata outside narrow bars so short runs remain understandable and actionable.
- Use existing native typography, column icons, theme colors, and controls.
- No expansion dialog is required for v1: the task permits replacing the Overview list directly.

These defaults resolve the design frontier; no user decision remains necessary.

## Acceptance criteria

### AC-1 — Run lanes and timing

Every recorded run appears exactly once in its own lane. Bars use `started_at` through `completed_at.unwrap_or(now)` on one common axis.

- Sort by start time, preserving input order for equal timestamps.
- Preserve real gaps and overlaps.
- Use the earliest start as origin and the latest normalized endpoint as extent.
- Total elapsed is extent minus origin, including gaps, rather than summed run durations.
- Clamp reversed intervals to zero duration.
- Use a minimum one-minute axis domain to avoid division by zero.
- Represent zero-duration runs with a visible marker; keep their numeric duration zero.
- Do not synthesize lanes for stages without runs.

### AC-2 — Live updates

While visible and containing an unfinished interval, the timeline samples the clock once per second. Its geometry and labels update without recreating the Board, description previews, focus state, or scroll state.

Terminal runs lacking completion timestamps follow the same endpoint rule and display “Completion time unavailable”; they retain their terminal status.

Stop ticking when the timeline is hidden, no intervals need the clock, or its entity is released. Returning to Overview immediately uses current time.

### AC-3 — Session activation

Activating a linked bar or its explicit open control emits the existing `Event::OpenSession` with that run’s exact session ID.

- Completed runs remain actionable.
- Runs without a session ID have no enabled session-opening action.
- Explicit open controls support keyboard activation and meaningful accessible labels.
- A tiny or zero-duration bar never removes access to the session control.

### AC-4 — Empty state

With no runs, show “No stage runs yet”. Do not render a meaningless axis or elapsed total.

### AC-5 — Status and elapsed semantics

Distinguish succeeded, failed, cancelled, interrupted, and running through readable status labels and status styling; color is supplementary.

Preserve native labels for partial (“Continued”) and redirected (“Sent back”). Preserve unknown status text with neutral styling.

Match existing `elapsedLabel` semantics:

- Negative durations clamp to zero.
- Below one minute: `<1m`.
- Below one hour: whole minutes, such as `59m`.
- One hour or longer: hours and remaining minutes, such as `2h 5m` and `1h 0m`.

Use the same semantics for lane durations, total elapsed, and axis duration labels. Overall status comes from the current card, using native status helpers and the column label as fallback.

### AC-6 — Information preservation

Preserve session navigation, harness/model subtitles, and every supplied run error.

Errors remain readable without hover, including long or multiline text. Unknown stages retain their stored name. Layout remains usable in the existing detail drawer: labels and actions stay accessible, and chart overflow remains inside the detail surface.

### AC-7 — Existing data only

Do not change `StageRun`, persistence, dispatch, harness telemetry, or session-navigation contracts. Board cards retain their current compact presentation.

## Out of scope

- Cost, tokens, and context-percentage metrics.
- Tool-call waveforms.
- Board-wide or multi-card Gantt views.
- New telemetry, dependencies, or schema migrations.
- Web timeline redesign or native feature expansion beyond this card’s requirements.

Existing Usage content elsewhere in Overview remains separate from the timeline.

## Constraints and edge cases

- Compute timestamp differences with checked or wider arithmetic before converting to layout coordinates; extreme signed timestamps must not overflow or produce invalid geometry.
- All valid integer timestamps remain representable; Rust timestamps do not require JavaScript NaN handling.
- Short bars may use a minimum visual marker size, but numeric durations and shared-axis positions remain truthful.
- Filter by selected card identity and reject stale snapshot updates.
- Preserve session identity when multiple attempts use different sessions.
- No animated geometry transitions or pulsing are needed; clock updates use direct geometry changes.
- Keep new modules cohesive and below approximately 250 lines.
- This Grill stage is read-only. MOLFAR captures these blocks; no files, task registry, commits, or handoff files are written here.

## Risks

- Reusing native `usage::duration` would violate elapsed-format parity.
- A Board-level timer could redraw unrelated content or retain stale card state.
- Small bars could obscure controls or error details.
- Missing completion timestamps could falsely imply a terminal run is active.
- Historical run failures could incorrectly override the current card’s overall status.
- A fitting chart may keep the longest running bar at full width as the axis expands; its elapsed total and axis must still advance.