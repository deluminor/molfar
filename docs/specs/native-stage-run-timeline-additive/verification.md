# Additive Native timeline rework verification

## Scope and source

Task-v2 is authoritative. Implementation commits are `28a176c9` and `41a89abf`; `9582cdb5` records the corrected requirements. Historical task-v1/spec-v4/plan-v4 and earlier implementation/review artifacts remain preserved.

## Acceptance evidence

Timeline modules below live in `crates/molfar-gpui/src/task_board/detail/timeline/`.

- **AC-1:** `preview.rs` renders a bounded preview before the preserved history. The composition regression asserts their order, simultaneous presence and accessible expansion.
- **AC-2:** `dialog.rs`, `view.rs` and `lane.rs` render a window-scoped Native modal with chronological runs, attempts, metadata, status and shared-axis bars. History retains input order.
- **AC-3:** `layout.rs` excludes reversed intervals from valid bounds and marks their timing unavailable. Rust's integer timestamp contract excludes nonfinite values. Model tests cover gaps, overlaps, zero/reversed/extreme intervals and unavailable data.
- **AC-4:** Both views and inspection use the retained Timeline clock. Clock tests cover geometry growth, completed intervals, visibility, release, and stable Board/preview/focus identity.
- **AC-5:** Existing Native status presentation and elapsed semantics remain shared and covered by fixtures.
- **AC-6:** Separate session controls preserve exact attempt/session identity. Activating a modal session action closes the modal before forwarding the existing event. Native tests verify the history and modal paths and missing-session behavior.
- **AC-7:** `inspection.rs` exposes stage, attempt, status, harness/model, local timestamps and UTC offset, duration, unavailable completion and complete errors. No-session runs have an Inspect action. Selected details survive pointer exit and transient focus dismissal; Page Up/Down scroll the details.
- **AC-8:** The vertical history retains metadata, errors and session actions below the preview. Usage integration is unchanged. Empty cards render one empty state without an axis or expansion control.
- **AC-9:** The dialog uses initial close focus, an explicit focus ring, Escape/backdrop dismissal and expansion-focus restoration. Keyboard and exact-session regressions pass; transient inspection clears when keyboard focus leaves its trigger while selected details remain.
- **AC-10:** Visibility/card-identity synchronization clears modal and inspection state and removes stale actions. Native coverage includes pending/failed replacement state.
- **AC-11:** Preview tracks have a bounded scrolling viewport. The modal fits a 600-by-500 test window with 32 runs and long errors. A retained chart scroll handle reveals focused runs. Presentation uses static geometry and no entrance animation; bar hover changes only bar opacity. Reduced-motion fixtures exercise the Native UI paths.
- **AC-12:** Automated Native verification and a built app are supplied. The user explicitly retained direct runtime UI verification; that manual acceptance step is not claimed as performed by the agent.
- **AC-13:** The rework changes only Native Rust UI/model/tests and specification/evidence files. No React/Tauri, schema, telemetry, dependency or board-wide timeline changes were made.

## Focus regression

A strengthened 32-run test first failed because the focused last run remained outside the modal viewport. GPUI's `Window::focus` changes focus without scrolling. The fix tracks the chart scroll container and reveals the focused row using the same chronological layout; oversized rows align at their top. The original regression and all 14 timeline tests subsequently passed.

## Manual verification ownership

The user retained UI verification in the latest instruction. The agent stopped UI automation, closed its isolated QA process and removed synthetic QA data. No interactive preview/modal/session/reduced-motion result is claimed. The user should verify the final built app before card acceptance.

## Board artifact publication

Corrected repository revisions are `spec.md` and `plan.md` in this folder. The rework submission contract supports only the implementation report, so historical board spec-v4/plan-v4 were not overwritten. The user must publish corrected board revisions through the owner workflow before final acceptance.

## Final automated results

- `npm run native:check`: exit 0. Native development scripts: 44 passed. Formatting and Clippy with warnings denied passed. Core tests: 964 passed, 2 ignored. GPUI tests: 1171 passed, 11 ignored. Scrollbar integration tests: 6 passed.
- `npm run native:build`: exit 0. The release build and local macOS app bundling/signing completed from implementation commit `41a89abf`.
- `codesign --verify --deep --strict`: exit 0 for the final Native app bundle.
- Targeted compiled Native timeline tests: 14 passed, exit 0. The strengthened focus regression failed before the explicit scroll fix and passed afterward.
- Staged secret scans and diff whitespace checks passed for implementation commits and are repeated for these evidence files.
- An existing future-incompatibility warning remains in dependency `block v0.1.6`. Native coverage and a dependency-audit gate are not configured. No manual runtime UI verification is claimed.

Built app: `crates/molfar-gpui/target/release/MOLFAR Native.app`.

Executable SHA-256: `277dfc1bb506b1c5ffd5a307a36774a4575cc51a3bf1e59466e25c95edb6a911`.
