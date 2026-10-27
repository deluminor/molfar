# Preparation verification

Base: origin/migration/gpui `ea6c8219bae954a3d8a9e8c536242b9531a683f7`. No application source, native dependency manifest or lockfile changed by preparation. Frozen source update is reviewed separately.

## Native baseline

- `cargo fmt --manifest-path crates/monocode-gpui/Cargo.toml --all --check`: exit 0 in this isolated checkout. Original nested worktree remains untouched; no parent Cargo manifest changes.
- `npm run native:test:dev`: exit 0, 29 passed, zero failed/skipped; fake tools and synthetic fixtures.
- Initial offline native core test: exit 101 before compilation, missing alacritty_terminal. `cargo fetch --locked --manifest-path crates/monocode-gpui/Cargo.toml`: exit 0 after authorized development network resolution.
- `CARGO_TARGET_DIR=/private/tmp/molfar-gpui-preparation-target CARGO_BUILD_JOBS=2 cargo clippy --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core -p monocode-gpui --all-targets --profile native-dev -- -D warnings`: exit 0.
- Native core test with same target/jobs/manifest/locked/offline/profile flags and `-p monocode-core`: initial sandbox run exit 101, 589 passed/14 socket-permission failures/2 ignored. Authorized repeat permitting synthetic local fixture sockets: exit 0, 603 passed/2 ignored. No production app, router, storage or credentials were used. Doc tests: zero tests, exit 0.
- Native GPUI test compilation using the same isolated target/jobs/manifest flags and `cargo test ... -p monocode-gpui --profile native-dev --no-run`: exit 0. No test/product executable was launched.
- GUI/runtime/device/performance/data-import/cross-platform runtime and full native GPUI test execution: SKIPPED, not authorized or not isolated yet. GPUI tests may be compiled with --no-run only.

## Native dependency audit — BLOCKER

`cargo audit --file crates/monocode-gpui/Cargo.lock`: exit 1; 7 vulnerabilities, 23 allowed warnings. This is unchanged native baseline dependency state, also unchanged by the frozen upstream delta. No security-clean or release-readiness claim.

Reported vulnerability IDs: RUSTSEC-2026-0387 (crypto-bigint 0.5.5), RUSTSEC-2026-0382 (rustls-webpki 0.103.15), RUSTSEC-2026-0384 (tokio 1.54.0), RUSTSEC-2026-0381 (webpki-roots 1.0.9), RUSTSEC-2026-0391 (zstd 0.13.3), RUSTSEC-2026-0403 and RUSTSEC-2026-0398 (zstd-safe 7.3.0). Full command evidence is retained in scratch/native-audit.log. A separate reviewed native dependency remediation is required before release; do not silently rewrite lockfiles in sync preparation.

## Workflow regression

`node --test scripts/gpui-sync/workflow.test.mjs`: red before fix (2 failed), green after fix (2 passed), both exit statuses captured. Tests verify the actual migration push target, PR path coverage for sync/checkpoints/native lockfiles/vendor sources, read-only permissions and native sync guard job. Full workflow also parsed with PyYAML BaseLoader and assertions for migration target/job: exit 0. Production CI uses Node tests, no new YAML dependency.

## Remaining gates

Operational sync tests, final independent review, test-compilation results and publication verification are recorded in the final session report. Native `cargo build --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-gpui --profile native-dev` (same isolated target/jobs) exited 0; upstream dependency block 0.1.6 emits a future-incompatibility warning. No proposed PR advances integrated/validated checkpoints. No automated/main merge, release, scheduler mutation or native runtime occurred.

## Final sync-tooling verification

`node --test --experimental-test-coverage --test-coverage-include='scripts/gpui-sync/lib/*.mjs' scripts/gpui-sync/*.test.mjs scripts/gpui-sync/tests/*.test.mjs`: exit 0, 28 passed, zero failed/skipped. Runtime coverage: 96.03% lines, 89.39% branches, 91.89% functions. The six independent publication/real-process-lock probes are included in the permanent suite. GitHub adapter tests use a fake executable, not remote writes.

Node entrypoint/module syntax and git diff whitespace checks: exit 0. New Node tooling has no separately configured ESLint/TypeScript gate; behavioral coverage, runtime input validation and syntax checks are reported rather than pretending tsc ran on JavaScript. No package dependency was added. Native rustfmt and all-target Clippy are the configured native lint/type gates.

Independent strong review found no remaining sync-tooling blocker after verified fixes for duplicate/racing/closed PRs, inherited tag pushes, Git/GitHub identity redirection, ledger poisoning/provenance and unsafe state paths. See sync-review.md. Overall native/runtime/release status remains NOT READY because of open parity, source-defect, dependency-audit and release-feed blockers. This does not block publishing bounded preparation review candidates.
