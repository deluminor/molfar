---
pr_title: "feat(task-board): add stage timeline preview and expanded modal"
---
# Spec — Stage timeline preview and expanded modal

## Problem and revised direction

The user needs an immediate view of stage timing without crowding the card sidebar, plus a spacious timeline for inspecting durations, retries, gaps, and overlaps.

Round 2 supersedes the earlier replacement proposal: **retain the vertical stage list, add a compact timeline above it, and open the full timeline in a modal**. Include polished motion and details on hover, with equivalent keyboard access.

## Repository baseline

Verified at `8bd86c6aaf1f4e74eba3006cc833bd52fe1018fd`:

- React/Tauri implementation under `src/features/task-board/`.
- `CardOverview.tsx` embeds the existing vertical `CardTimeline.tsx`.
- `StageRun` already supplies required timestamps, status, attempt, harness, model, error, and session ID.
- Shared `Modal` supports portals, Escape handling, viewport fitting, and a large size capped at 880px. Focus containment and restoration are not established by that component alone.
- Existing elapsed, card-status, stage-icon, harness, theme, and reduced-motion conventions can be reused.

## Scope

### Sidebar preview

Above the existing vertical list, show a compact “Stage timeline” panel:

- Total elapsed, current overall card status, and an explicit “Expand timeline” button.
- A miniature shared-axis timeline with one slim track per run. All runs remain represented; do not silently truncate attempts.
- At most 144px of preview tracks visible at once, with internal vertical scrolling for longer histories.
- Preview fits sidebar width without horizontal page overflow. Omit dense tick labels and in-bar text; the existing vertical list supplies full stage metadata.
- Preview marks are noninteractive and decorative for accessibility. The named expand button is the single preview action, avoiding nested controls and tiny session targets.
- No runs: show “No stage has run yet.” once, without an empty axis, elapsed summary, or expand action.

Keep the vertical list’s stage labels, attempt labels, status, duration, harness/model, session controls, and non-success errors. Preserve its current order and error-display behavior.

### Expanded modal

Use the shared modal with `size="lg"` and viewport fitting. Its title identifies the card and “Stage timeline”.

- Header shows total elapsed and overall card status.
- Full timeline shows one labeled swimlane per run, including repeated attempts.
- Labels use `COLUMN_LABEL`, adding `attempt N` for attempts greater than one.
- Order full-timeline rows by start time, retaining input order for ties; use run IDs as stable keys.
- Fixed-width stage labels, aligned time tracks, relative elapsed ticks, and subtle grid lines make timing comparable.
- Show status, duration, and harness/model outside bars so short runs remain readable.
- Keep label column and axis available while scrolling. Contain horizontal overflow within the chart; contain vertical overflow within the dialog.
- Close via visible close button, Escape, or backdrop using shared conventions. Trap keyboard focus while open and restore focus to the expand button on close when it still exists.
- Closing preserves underlying sidebar scroll and content state.
- Closing the card, switching cards, or leaving Overview dismisses the modal and any hover details.
- Activating a session closes the modal before invoking the existing session-navigation callback exactly once.

### Geometry and timing

Both views consume the same calculated intervals:

- Origin: earliest valid start.
- Endpoint: `completedAt ?? now`.
- Extent: latest effective endpoint; use a minimum one-second domain.
- Positions preserve actual gaps and overlaps rather than concatenating durations.
- Total elapsed spans earliest start to latest endpoint, including idle time; do not sum run durations.
- Zero-duration and negative-duration intervals render visible markers, with negative durations clamped to zero.
- Nonfinite timestamps produce “Timing unavailable” rows. Exclude those intervals from axis bounds, retaining metadata, errors, and session access.
- If all intervals are invalid, omit the axis and show timing-unavailable messaging.
- A terminal status without completion time follows the null-endpoint rule, with “Completion time unavailable”; never label it running.
- Format durations and total elapsed through existing `elapsedLabel`.

Overall status derives from current card state through existing `cardStatus` rules and their real context inputs. Reuse current stage label when that helper returns null. Historical failures must not override current overall status.

### Live updates

Use one shared one-second clock while the visible Overview has valid open-ended intervals. Preview, vertical-list durations, modal, and open details receive the same `now`.

Ticks must preserve row identity, keyboard focus, scroll position, and open details. They must not reload the card, issue telemetry requests, or remount the detail panel.

Stop the clock when no displayed interval needs it or when Overview unmounts. Refresh immediately on card changes and modal opening.

### Inspection and session interaction

In the modal, hover or keyboard focus reveals:

- Stage and attempt.
- Explicit status.
- Harness and full model name.
- Start and completion timestamps in local time with timezone identified.
- Duration and running or missing-completion indication.
- Non-success error text, preserving line breaks.

Details must remain visible while moving between trigger and details surface and dismiss on Escape, blur outside the surface, or pointer departure. Keep them within the modal viewport. Escape dismisses details before dismissing the modal.

Provide a persistent selected-run details region, populated by focus or pointer activation, so touch users and long errors do not depend on hover. Long content scrolls there.

Bars with session IDs are native buttons; activation opens the exact session. A separate minimum 32px open control outside the bar supports very short intervals. Do not nest buttons. Runs without sessions expose no session action; their inspection control remains keyboard accessible.

### Visual treatment and motion

Use existing theme colors, stage icons, rounded surfaces, restrained borders, and tabular time labels.

- Five statuses have distinct colors and explicit text.
- Hover subtly changes the relevant bar color; no track-background recoloring or geometry-animation restart.
- Entrance uses a short opacity/translation transition, approximately 180–220ms, once per opening.
- Hover/focus feedback uses approximately 120–150ms transitions.
- Live geometry updates directly, without repeated entrance animation.
- Any running indicator remains subtle.
- Reduced motion disables entrance movement, animated running indicators, and transitions while retaining all information.

## Acceptance criteria

| ID | Observable result |
| --- | --- |
| AC-1 | Full modal shows every run and repeated attempt on its own correctly positioned swimlane. Preview represents the same intervals. |
| AC-2 | Advancing time updates open-ended bars and durations without remounting or losing focus, details, or scroll. |
| AC-3 | Completed runs with session IDs open their exact session through bar or open control; callback fires once and modal closes. |
| AC-4 | No runs shows one empty state without axes, elapsed summary, or expand action. |
| AC-5 | All five statuses have distinct labels/colors; elapsed values retain existing formatting semantics. |
| AC-6 | Existing vertical list remains below preview, preserving session access, attempts, metadata, and non-success errors. |
| AC-7 | No StageRun schema, telemetry, dependency, deferred metric, or compact board-card behavior changes are required. |
| AC-8 | Preview and modal share accurate total elapsed and current overall card status. |
| AC-9 | Invalid, zero, negative, overlapping, tied, and long intervals retain finite geometry and usable information. |
| AC-10 | Preview fits narrow sidebar; modal contains scrolling and remains usable within viewport bounds. |
| AC-11 | Modal opens/closes accessibly, contains/restores focus, and dismisses stale content on card/tab changes. |
| AC-12 | Hover, keyboard, and touch inspection expose full run details, including long errors and missing completion. |
| AC-13 | Entrance and hover motion follow specified behavior; reduced motion removes animation without losing content. |

## Out of scope

Replacing the vertical list; board-wide Gantt; zoom/pan controls; cost, tokens, context percentage, or waveforms; new telemetry; persistence changes; third-party chrome replication.

## Constraints and risks

- Keep pure geometry separate from rendering and clock effects.
- Search existing helpers and interaction primitives before adding new ones.
- Group modules under timeline concerns; keep files approximately 250 lines or fewer.
- Reuse shared modal without assuming it already supplies focus containment.
- Large histories must remain scrollable without hiding runs.
- DOM tests cannot establish actual layout, visual polish, native navigation, or animation quality.
- No product decision remains open: the user delegated visual design choices; the concrete defaults above define the proposed design.