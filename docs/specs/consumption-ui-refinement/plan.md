# Plan

## Goal
Improve Board usage spacing and Home consumption exploration.

## Technical Approach
Reuse GPUI controls, consumption formatting and tooltip components. Store selected range in Home consumption state; aggregate existing daily summaries into local calendar buckets without new dependencies or database changes.

## Architecture Overview
Home feed state selects range; pure aggregation produces chart buckets and totals; chart renders labels and tooltips. Widget lists retain existing navigation and gain sufficient scroll space. Board detail usage gets bottom padding.

## Risks & Mitigations
- Date boundaries or missing days: tests for month/year boundaries, leap days, empty and future data.
- Ten rows exceed saved widget height: bounded scrolling; preserve saved layouts.
- Partial estimates: reuse reporting semantics; never imply complete cost.

## Execution Stages
1. Adjust Board usage bottom padding.
2. Add range state and bucket aggregation with tests.
3. Add selector, readable axes and rich tooltips.
4. Expand both rankings to ten with bounded scrolling.
5. Run relevant tests and native gates; review diff, commit and push requested branch.

## Testing Strategy
Aggregation regression tests, Home rendering tests where available, fmt, clippy, core and GPUI suites, size gate. Runtime visual QA remains unrun unless explicitly requested. Verify branch before commit and push.

## Constitution Check
No new dependencies or public contracts; reuse existing components. Run d-analyze before implementation after approval.

## Analyze gate
PASS: all eight requirements map to execution tasks; no orphan tasks, contradictions or constitution conflicts. Calendar boundaries, empty buckets and future data covered by aggregation tests; scroll containers retain both rankings.
