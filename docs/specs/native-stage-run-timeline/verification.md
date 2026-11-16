# Native stage-run timeline verification

## Acceptance evidence

- **AC-1:** `detail/timeline/layout.rs` computes a stable chronological layout with wide timestamp arithmetic, shared origin, gaps, overlaps, normalized endpoints and a one-minute minimum domain. `tests/model.rs` covers interval ordering, zero/reversed/extreme intervals and clock-dependent geometry. `lane.rs` renders every run with stable run IDs and attempt labels.
- **AC-2:** `Timeline` retains a cancellable one-second task in `clock.rs`. Ticks notify only the timeline entity. Board snapshots, selection, drawer/tab transitions and Shell page visibility synchronize eligibility. `tests/clock.rs` covers bar growth, focus and preview identity, pause/restart, completion, foreign-card filtering and release.
- **AC-3:** Bars and focusable open controls emit the existing session event through the Board subscription. Native tests cover exact attempt/session identity, missing links, mouse activation and Enter activation. The same handler supports Space.
- **AC-4:** Empty timelines return before rendering elapsed totals and axes. Native tests assert axis absence before runs are supplied.
- **AC-5:** `elapsed.rs` matches web minute/hour formatting with boundary fixtures. `status.rs` tests native labels and unknown fallbacks. Header status comes from the current card's native status helper, with its column label as fallback.
- **AC-6:** Lane metadata retains stage, attempt, harness/model, errors and session controls outside bar geometry. Missing terminal completion times have an explicit notice. Native tests cover zero-duration access, multiline error height and chart bounds within the drawer.
- **AC-7:** The diff leaves StageRun, persistence, dispatch, telemetry, dependencies and board-card presentation unchanged.

Timeline modules and tests live under `crates/molfar-gpui/src/task_board/detail/timeline/`. Board and Shell integration use their existing modules.

## Design adjustments

The implementation reuses StageRun and existing native helpers directly, avoiding redundant input wrappers and single-use constants modules. The tick constant lives with clock ownership. Shell navigation explicitly marks retained Board entities hidden or visible. Rendering is split into cohesive view, lane, status and clock modules.

## Verification scope

The implementation follows the approved native handoff. The earlier web timeline specification remains separate. No interactive UI QA was run; automated native tests do not establish visual parity. Native coverage and a dependency-audit gate are not configured. Clippy reports an existing future-incompatibility warning for `block v0.1.6`.

## Executed checks

- `npm run native:check`: exit 0. Includes native script tests (44 passed), formatting, Clippy with warnings denied, core tests (964 passed, 2 ignored), GPUI tests (1167 passed, 11 ignored) and scrollbar integration tests (6 passed).
- Final standalone Clippy for core and GPUI, all targets, native-dev profile: exit 0.
- Compiled GPUI binary filtered to `task_board::detail::timeline`: exit 0, 10 tests passed.
- Staged secret scan and diff whitespace checks: exit 0 before the implementation commit; repeated for the verification commit.
- Initial clock test failed before the entity existed. During integration, mouse navigation tests exposed offscreen targets; the fixtures now scroll the existing drawer before activation. Both navigation paths pass in the final full gate.

The full gate was run with permitted execution because the sandbox blocks local-socket and process fixtures in existing core tests. No coverage, release/signing build or interactive visual QA is claimed.
