# Plan — Stage timeline preview and expanded modal

## Goal

Add a compact timeline above the preserved vertical stage list and a polished, accessible expanded modal using existing stage-run data.

## Technical Approach

Use existing React, TypeScript, Tailwind/CSS, shared Modal, and Vitest infrastructure. Render HTML tracks and bars without a chart library or new dependency.

Keep `CardTimeline.tsx` as the vertical list. Compose a new timeline experience above it through `CardOverview.tsx`.

One pure layout calculation and one visibility-scoped clock supply the preview, expanded view, summaries, inspection details, and vertical-list durations.

## Architecture Overview

- `model/stage-timeline/layout.ts`: ordering, validated endpoints, shared bounds, geometry, and summary interval.
- Concern-local `types.ts` and `constants.ts`: only required contracts and timing/layout values.
- `ui/card-detail/timeline/StageTimeline.tsx`: composition, expansion state, shared clock, and current-card summary.
- `StageTimelinePreview.tsx`: compact tracks and expand action.
- `StageTimelineDialog.tsx`: shared Modal integration, modal lifecycle, focus handling, and chart viewport.
- `StageRunLane.tsx`: labels, bars, inspection and session controls.
- `StageRunDetails.tsx`: hover/focus details and persistent selected-run details.
- `hooks/use-stage-timeline-clock.ts`: one-second lifecycle with cleanup.
- `CardOverview.tsx` and `DetailTabBody.tsx`: pass visibility, card identity, runs, and existing status context; adapt obsolete render-time `now` plumbing.
- Existing `CardTimeline.tsx`: retain vertical presentation; consume synchronized time and shared status presentation where needed.
- Existing shared `Modal`, popover infrastructure, elapsed helper, status chip, column look, harness metadata, and theme tokens: reuse directly.

Before adding focus or inspection helpers, inspect shared overlay behavior and tests. If a shared primitive needs extension, keep the change backward compatible and add its regression tests.

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Preview crowds sidebar | Poor readability | Miniature tracks, bounded preview height, existing full metadata below |
| Separate clocks/layouts drift | Conflicting timing | Single clock and shared geometry |
| Modal lacks focus trapping | Keyboard escapes overlay | Inspect shared behavior, add scoped containment/restoration and tests |
| Hover surface is clipped | Details inaccessible | Modal-aware positioning and persistent details region |
| Long errors or short runs | Lost information/actions | Scrollable details and independent open controls |
| Entrance repeats on ticks | Flicker | Stable keys and opening-only motion |
| Stale modal survives navigation | Wrong card/session | Card/tab-scoped state and dismissal |
| Malformed timestamps | Invalid styles | Finite validation and explicit unavailable states |
| Header infers status from history | Misleading state | Existing card-status context and current run selection |

## Execution Stages

### Stage 1 — Shared interval model

- [ ] Search existing timing, formatting, status, and overlay helpers.
- [ ] Add `model/stage-timeline/{layout,types,constants}.ts` as needed.
- [ ] Implement stable chronological ordering, finite validation, bounds, markers, endpoint rules, and total interval.
- [ ] Add `model/stage-timeline/layout.test.ts`.

**Checkpoint:** Deterministic tests cover empty/all-invalid input, gaps, overlaps, retries, tied starts, zero/negative durations, future starts, long spans, completed endpoints, and null completion on both running and terminal statuses.

**Coverage:** AC-1, AC-4, AC-5, AC-8, AC-9.

### Stage 2 — Add compact preview and preserve vertical history

- [ ] Add `timeline/StageTimeline.tsx` and `StageTimelinePreview.tsx`.
- [ ] Update `CardOverview.tsx` to place preview immediately above existing `CardTimeline`.
- [ ] Reuse status-chip and elapsed presentation with actual card-status context; thread needed inputs through `DetailTabBody.tsx`.
- [ ] Extract existing run-status styles into a shared concern-local constant if required; use it from both views rather than duplicating mappings.
- [ ] Implement bounded preview height, all-run representation, and a named expand action.
- [ ] Add `timeline/stage-timeline-preview.test.ts` and extend existing card-detail tests.

**Checkpoint:** Tests prove vertical list remains below preview; sessions/errors/attempts are preserved; empty state appears once; summary matches model; preview has one expansion action and no tiny interactive marks.

**Coverage:** AC-1, AC-4, AC-5, AC-6, AC-8, AC-10.

### Stage 3 — Expanded modal and session navigation

- [ ] Add `StageTimelineDialog.tsx` and `StageRunLane.tsx`.
- [ ] Reuse shared `Modal` with large size and viewport fitting.
- [ ] Add aligned tracks, fixed label area, relative ticks, contained scrolling, and independent short-bar session controls.
- [ ] Inspect shared focus/overlay utilities, then implement any missing focus containment and restoration.
- [ ] Close modal before session callback; dismiss on card close, card change, or Overview departure.
- [ ] Add `timeline/stage-timeline-dialog.test.ts`; extend shared `Modal.test.ts` only if that primitive changes.

**Checkpoint:** Tests cover every run/attempt, distinct status text/styles, exact callbacks, missing sessions, short markers, modal opening/closing, Escape/backdrop, focus containment/restoration, and stale-state dismissal.

**Coverage:** AC-1, AC-3, AC-5, AC-9, AC-10, AC-11.

### Stage 4 — Detailed inspection and polished motion

- [ ] Add `StageRunDetails.tsx` using existing modal-aware overlay primitives where suitable.
- [ ] Implement hover/focus inspection, pointer-safe dismissal, Escape priority, and persistent selected-run details.
- [ ] Include complete metadata, local timestamps/timezone, duration, missing-completion warning, and multiline errors.
- [ ] Add focused motion rules under the timeline concern and connect them through existing stylesheet imports.
- [ ] Implement once-per-opening entrance, bar-only hover feedback, stable live geometry, and reduced-motion overrides.
- [ ] Add `timeline/stage-run-details.test.ts` and motion-state assertions to dialog tests.

**Checkpoint:** Keyboard and pointer events expose identical details; no-session runs remain inspectable; long content remains available; Escape dismisses details first; ticks/hover do not retrigger entrance. Reduced-motion styles disable movement and running animations.

**Coverage:** AC-5, AC-9, AC-10, AC-12, AC-13.

### Stage 5 — Shared live clock and lifecycle

- [ ] Add `hooks/use-stage-timeline-clock.ts` and its `.test.ts`.
- [ ] Connect one clock above both visualizations and vertical history.
- [ ] Adapt obsolete `now` plumbing in `CardOverview.tsx` and `DetailTabBody.tsx`.
- [ ] Refresh time on card changes and modal opening; retain one interval while valid displayed endpoints depend on `now`.
- [ ] Extend integration tests for running-to-completed changes, tab/card changes, and unmount cleanup.

**Checkpoint:** Fake timers advance preview, modal, details, and list consistently. Completed geometry remains fixed. DOM identity, focus, inspection state, and scroll survive ticks. No extra store loads or network requests occur.

**Coverage:** AC-2, AC-8, AC-9, AC-11, AC-12, AC-13.

### Stage 6 — Verification and scope review

- [ ] Run targeted geometry, preview, dialog, details, clock, card-status, card-detail, and affected shared-overlay suites through project Vitest.
- [ ] Run `npm run check:web`.
- [ ] Run `npm run build`.
- [ ] Review diff for unchanged schemas, backend telemetry, dependencies, compact board cards, and retained vertical history.
- [ ] Review module size, direct imports, helper reuse, accessible names, focus behavior, timing rules, overflow constraints, and motion.
- [ ] Record commands, exit statuses, and any skipped checks.

**Checkpoint:** Relevant behavioral tests, web gate, and production build pass. No runtime or visual claim is inferred from synthetic tests.

**Coverage:** AC-1 through AC-13; AC-7 explicitly checked by diff review.

## Testing Strategy

### Automated

Use pure Vitest model tests and existing happy-dom/createRoot/React `act` integration patterns. New test files use `.test.ts`, matching current discovery.

Test public behavior: interval geometry, rendered history, summaries, session callbacks, inspection, focus, clock cleanup, and stable element identity. Include empty, malformed, absent-session, terminal-without-completion, long-error, retry, and navigation cases.

The repository has no dedicated lint script; report that accurately. `check:web` covers tests and TypeScript; build runs separately.

### Runtime checklist

When browser/UI QA is explicitly authorized, verify:

- Narrow sidebar at 280px and 360px: preview stays contained and vertical history remains usable.
- Modal at 640×480 and 1280×800: controls remain visible, labels align, scrolling stays inside dialog.
- At least 30 runs, long models, multiline errors, overlapping runs, and tiny intervals.
- Hover transfer, keyboard focus loop, Escape priority, touch inspection, and native session navigation.
- Opening animation, live updates, and reduced-motion behavior without flicker.

This read-only Grill stage does not authorize launching a browser. Runtime checks remain unrun until exercised; implementation must distinguish them from automated verification.

## Constitution Check

PASS. The stage-specific read-only/output contract overrides persistence, task-tool writes, approval waiting, and implementation. No files are created, modified, staged, or committed here. No branch switch, push, or PR action is included.

Later implementation uses small concern modules, existing contracts/helpers, strict types, behavioral tests, and no attribution.

## Analyze Gate

- Coverage: 13 acceptance criteria mapped to stages and explicit verification.
- Uncovered requirements: none.
- Orphan tasks: none.
- Contradictions: resolved by retaining vertical history and moving the full swimlane into a modal.
- Ambiguities: visual choices delegated by the user are expressed as concrete proposed defaults.
- Constitution conflicts: none under the read-only stage contract.
- Verdict: PASS for planning consistency. Implementation belongs to the subsequent Board stage.

## Current Verification

All four handoff files and relevant repository components were inspected. HEAD matches the supplied base. Working-tree status was clean before and after inspection. No files changed. Tests, builds, browser QA, and native runtime checks were not run.