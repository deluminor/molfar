# Implementation verification

## Delivered

All six stages are implemented. The compact preview remains above the original vertical history. Both the modal and preview consume the pure interval layout. One Overview-scoped clock supplies all durations, including terminal runs missing completion times. Existing schema, telemetry, dependencies, and compact board cards remain unchanged.

The expanded shared Modal has scoped focus containment, visible close/backdrop/Escape controls, and focus restoration. Session actions synchronously dismiss the modal before invoking navigation once. Card identity keys and Overview unmount dismiss stale inspection and modal state.

The timeline uses chronological rows, sticky stage labels and relative-time axis, contained scrolling, visible minimum-width markers, full status/duration metadata, independent session controls, and persistent selected-run details. Shared Popover supplies keyboard/pointer inspection, viewport placement and Escape priority. Details include local timestamps with timezone, complete model name, multiline errors and missing-completion messaging. Concern-local CSS supplies opening-only entrance, bar-only hover feedback, and reduced-motion overrides.

## Acceptance evidence

- AC-1: `layout.test.ts` covers shared geometry/order; dialog tests cover every run/attempt and 30-run histories. Preview uses the same layout rows.
- AC-2: `stage-timeline-live.test.ts` advances the one clock across preview, list, modal and selected details. Dialog tests retain DOM identity, focus and scroll through time changes.
- AC-3: Dialog tests exercise both session controls, exact ID, one callback, and dialog removal before navigation.
- AC-4: Preview and dialog composition tests show one empty state without expansion or summary.
- AC-5: Shared `RUN_STATUS` retains five distinct styles and explicit labels; all durations use `elapsedLabel`.
- AC-6: Composition test retains list order, attempts, multiline errors and session controls below the preview.
- AC-7: Diff review confirms no schema, telemetry, package, lockfile or compact-card changes.
- AC-8: Layout spans earliest start to latest endpoint, including gaps. Current status uses `cardStatus`, actual board stall threshold and pending-input context; historical failure does not override current status.
- AC-9: Model tests cover malformed/zero/negative/future/tied/overlapping/long/extreme intervals. Invalid rows retain metadata and inspection/session access; CSS supplies visible zero-width markers.
- AC-10: Preview tracks cap at 144px. Dialog fits viewport; chart contains both scroll axes with sticky labels/axis and scrollable selected details. Runtime dimensions remain unverified.
- AC-11: Dialog tests cover focus loop/restoration, Escape priority, backdrop and card replacement. Overview integration covers modal and timer cleanup on departure.
- AC-12: Details tests cover full model, error lines, retries and unavailable completion. Interaction tests cover focus, pointer transfer/departure, and click-selected persistent details without a session.
- AC-13: CSS defines 200ms entrance and 140ms hover feedback; stable DOM prevents re-entry on ticks. Reduced-motion overrides remove animations/transitions. Actual motion remains unverified.

## Automated checks

- Targeted model, status, preview, dialog, details, shared Modal, live integration and clock suites: 39 tests pass, exit 0.
- `npm run check:web`: tests and TypeScript pass, exit 0; 577 suites pass, 2 skip; 5955 tests pass, 13 skip.
- `npm run build`: exit 0. Existing CSS highlight and bundle-size warnings remain.
- Prettier checks on new modules, diff whitespace check and staged secret scanner: exit 0.
- Dedicated lint and configured coverage gates are absent; neither is reported as passing.
- Browser/native runtime QA was not requested and remains unrun. Synthetic tests do not prove viewport layout, visual polish, actual motion, or native session navigation.

## Dependency recovery

An initial run copied incompatible installed tools from the project checkout. This continuation installed dependencies matching the existing lockfile with `npm ci --ignore-scripts`. Installed Vitest is now 3.2.7; the full web gate passes. No package or lockfile changes were needed. Temporary installation cache was removed.

## Plan notes

The plan's read-only constitution text describes the earlier planning stage. The current Implement instruction authorizes code and commits. Existing Modal/Popover primitives were reused without modifying shared overlay behavior; focus containment is scoped to this dialog. Clock integration was delivered with the UI to keep all consumers synchronized from first use.
