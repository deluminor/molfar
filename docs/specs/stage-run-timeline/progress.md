# Implementation checkpoint

## Delivered

Stage 1 only: pure interval layout with immutable input, stable chronological ordering, shared bounds, real gaps and overlaps, null completion endpoints, invalid timing retention, minimum one-second domain, zero/negative duration clamping, and finite percentage geometry. Zero-width intervals remain zero in the model; the later renderer must supply visible markers without distorting time geometry.

Nine model tests pass. Production build and independent TypeScript check exit 0. Full `npm run check:web` exits 1: 3 suites fail, 569 pass, 2 skip; 15 tests fail, 5923 pass, 13 skip. Failures occur in existing suites outside the changed model (including FamiliarChangesView and displayPrefs); no baseline comparison was run, so their cause remains unverified.

The checkout initially had no node_modules. Dependencies were copied locally from the project checkout because a symlink cannot support Vite's cache writes under the sandbox. Installed Vitest reports 4.1.12 despite package.json requesting ^3.2.4; reproduce with lockfile-matched dependencies before treating full-suite results as authoritative. No manifest or lockfile changed.

## Remaining

Stages 2 through 5 are unimplemented. There is no visible timeline change, modal, inspection UI, motion, or shared clock yet. Stage 6 remains incomplete because the full web gate fails and acceptance integration tests do not exist. No browser or native runtime QA was authorized or run. No dedicated lint script or coverage gate is configured.

All AC-1 through AC-13 remain incomplete at product level. Stage 1 supplies model evidence toward AC-1, AC-4, AC-8 and AC-9; it does not establish rendered behavior. Existing schema, telemetry, dependencies, board cards and vertical history are untouched.

The copied spec and plan retain the approved planning-stage content. Their read-only constitution wording describes that earlier stage; the current Implement instruction authorizes implementation and commits.
