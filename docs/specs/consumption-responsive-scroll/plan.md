# Plan
## Goal
Polish consumption layout and motion; correct nested scroll ownership; reclaim unused build storage.
## Approach and architecture
Keep saved Home layout unchanged. Derive presentation geometry from body width/height. Reserve chart label space and bound ranked lists. Reuse native animation and scroll APIs. Prove shared wheel dispatch with a nested-scroll fixture, then correct shared dispatch if reproduced. Hover state belongs to chart presentation, separate from accounting.
## Risks
Shared scrolling affects other surfaces: test axes, diagonal gestures, boundaries and Board wheel regressions. Small widgets require scrolling: retain access to all rows. Motion must settle and honor reduced motion. Cleanup must only remove known inactive generated caches and the legacy app.
## Stages
1. Reproduce nested wheel bug.
2. Fix event consumption and boundary handoff.
3. Adapt chart/list geometry and finite hover transitions.
4. Test geometry, scroll and motion; run fmt, clippy, native tests and size gate.
5. Remove confirmed inactive build artifacts.
6. Commit and push the authorized feature branch after checks.
## Testing
GPUI event/offset tests, Home geometry at multiple sizes, hover entry/switch/exit and reduced motion. Board wheel tests. No live UI QA requested.
## Analyze gate
PASS: requirements map to tasks; no contradictions or public contract/dependency changes. Shared vendor correction explicitly covered by regression tests. Cleanup explicitly authorized and separated from source edits.

## Investigation evidence
The initial nested-wheel regression test failed because both child and parent offsets moved by the same event. Native div listeners changed offsets without consuming the event. The shared fix clamps offsets before comparison and consumes only events that move the child. Custom callbacks run before the native default so same-element listeners remain available. Boundary handoff, reverse direction, horizontal/vertical/diagonal input and custom callbacks are covered.

The initial geometry test reproduced clipped axis text. The final layout combines the period selector with the summary heading, uses explicit text metrics and reserves axis space. Saved widget geometry is not changed. Month-axis labels avoid crowding the final date.

## Authorized cleanup
Removed inactive `/private/tmp/molfar-review-target`, root `target/`, `crates/molfar-gpui/target/debug/` and the unused legacy `/Applications/MOLFAR.app` (about 65 GiB of artifacts). Preserved the running `/Applications/MOLFAR Native.app`, application data and the current native-dev build cache. No worktrees or source checkpoints were removed.
