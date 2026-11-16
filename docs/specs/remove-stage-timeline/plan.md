# Removal plan

## Goal
Restore the vertical stage history and remove both timeline feature implementations.

## Approach
Reverse the feature changes introduced by merged PRs #149 and #147, with explicit diff review to preserve unrelated fixes where necessary. Remove feature-specific planning documents superseded by this removal. No schema or dependency changes.

## Stages
1. Remove Native swimlane implementation and restore the pre-feature vertical list.
2. Remove React swimlane implementation and restore its vertical list; retain unrelated stale-card safety if possible.
3. Run Native format/type/lint and relevant regression tests, build Native, and run the web pre-push gate.
4. Commit and push main without rewriting history.

## Risks and verification
Review all reverted paths for unrelated changes. Verify both vertical renderers remain, no feature imports remain, and no data migrations or telemetry changes occur. Native runtime QA belongs to the owner.

## Consistency gate
Requirements map directly to stages 1-4. No uncovered requirements or contradictory scope. Removal and main push explicitly authorized by the user.

## Verification results

- `cargo fmt --manifest-path crates/molfar-gpui/Cargo.toml --all --check`: exit 0.
- Native GPUI Clippy with all targets and warnings denied: exit 0.
- Native vertical-history session-navigation regression: 1 passed, exit 0.
- `npm run check:web`: exit 0; 7159 tests passed, 13 skipped, TypeScript, lint and structural checks passed.
- `npm run native:build`: exit 0. Bundle signature verified successfully.
- No residual swimlane feature references in either implementation; both vertical lists retained. Existing stale-card identity guard retained.
- Full Native suite not rerun: no core/data behavior changed; Native compilation and focused navigation regression cover this removal. Manual UI QA remains with the owner.
