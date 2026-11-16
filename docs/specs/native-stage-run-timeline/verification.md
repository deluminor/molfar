# Task-v2 rework verification

## Current results

- Production composition already renders preview then preserved vertical history; no production change needed.
- Extended GPUI composition regression verifies multiline history error height and persistence while expanded modal is open. Targeted command: `cargo test --locked --manifest-path crates/molfar-gpui/Cargo.toml -p molfar-gpui --profile native-dev compact_preview_precedes_preserved_history_and_expands -- --test-threads=1`, exit 0 (1 passed). No new production behavior or red-green implementation cycle is claimed.
- `npm run native:check`: exit 0 with permitted execution. 44 script tests, 964 core tests, 1171 GPUI tests and 6 scrollbar tests passed; 13 ignored. Formatting and all-target Clippy/type checking passed.
- Initial sandbox native check: exit 101, 15 core socket/process fixture failures (`Operation not permitted`); permitted full rerun cleared them.
- `npm run native:build`: exit 0; release app built and signed in this checkout. Production source unchanged from starting HEAD 022d3d6f; test commit 4b9bcfa4.
- `git diff --check`: exit 0. Diff reviewed: test and documentation only; no new IO, dependencies, telemetry or web changes.
- Existing warning: future Rust incompatibility in block v0.1.6.

## Remaining acceptance gaps

Direct runtime verification in the built Native app was not performed: preview/modal appearance, scrolling, keyboard/session behavior and reduced motion remain unverified (AC-1, AC-9, AC-11 and AC-12 runtime portions). Automated tests do not establish runtime acceptance.

Repository spec and plan now follow all 13 task-v2 criteria. Ignored board spec-v4/plan-v4 are historical and were not edited. The stage exposes only implementation-report submission, so the user must correct board artifacts through its publication workflow before acceptance. Return through Code review and Final review; no delivery, merge or release.

---

# Historical verification (superseded criterion numbering)

The evidence below predates task-v2. Current acceptance uses all 13 criteria in spec.md; this historical section does not establish current acceptance.

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
