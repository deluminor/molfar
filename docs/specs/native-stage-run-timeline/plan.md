# Plan — additive Native stage-run timeline

## Goal

Keep the compact preview first and existing vertical history immediately below it, with a detailed Native modal.

## Technical approach and architecture

Reuse Timeline rendering (`preview` then `view(false)`), existing lane metadata/error/session controls, shared layout and clock, and native modal navigation. No new abstractions or dependencies. Current checkout already implements this composition; preserve it.

## Execution stages

1. Inspect task-v2 and current composition; reconcile all 13 criteria and preserve historical artifacts.
2. Extend the GPUI composition regression to verify multiline errors, exact-session navigation and history persistence across modal dismissal.
3. Run targeted regression, native lint/type/test gate and Native app build; inspect final diff.
4. Record runtime verification separately; submit implementation report through Code review and Final review. No delivery, merge or release.

## Risks and mitigations

- Historical replacement wording: authoritative task-v2 criteria copied into corrected repository spec; report board artifact mismatch for correction.
- Hidden regression in history: assert preview ordering and persistent error/session controls together.
- False runtime parity claim: distinguish automated tests from direct app verification.

## Testing strategy and traceability

- AC-1, AC-8: composition and history regression, including errors and sessions.
- AC-2, AC-3, AC-5: existing geometry/status/model tests and modal tests.
- AC-4: retained-clock identity, completion and visibility tests.
- AC-6, AC-7, AC-9: exact-session navigation, keyboard inspection, persistent selection and dismissal tests.
- AC-10: stale-card filtering and lifecycle tests.
- AC-11: narrow bounds, long errors and many-run focus scrolling tests; direct runtime/reduced-motion checks remain required.
- AC-12: npm run native:check and npm run native:build; direct built-app QA recorded separately.
- AC-13: final diff review for Native-only scope.

## Analyze gate

Task-v2 criteria 1–13 map to checks above. Additive composition and modal requirements agree across spec and plan. No new product decisions. Runtime evidence and board artifact publication remain explicit acceptance gaps until performed.
