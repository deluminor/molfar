# Isolated native validation

Use this preparation checkout, outside the original enclosing MOLFAR workspace:

`/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar-worktrees/molfar-56bca169`

The old full-format failure was workspace discovery in the nested original worktree. The same full command succeeds here without editing any Cargo manifest. Keep the original dirty native worktree untouched. No new wrapper or manifest override is required.

```sh
cargo fetch --locked --manifest-path crates/monocode-gpui/Cargo.toml
cargo fmt --manifest-path crates/monocode-gpui/Cargo.toml --all --check
npm run native:test:dev
node --test scripts/gpui-sync/*.test.mjs scripts/gpui-sync/tests/*.test.mjs
CARGO_TARGET_DIR=/private/tmp/molfar-gpui-preparation-target CARGO_BUILD_JOBS=2 cargo clippy --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core -p monocode-gpui --all-targets --profile native-dev -- -D warnings
CARGO_TARGET_DIR=/private/tmp/molfar-gpui-preparation-target CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-gpui --profile native-dev
CARGO_TARGET_DIR=/private/tmp/molfar-gpui-preparation-target CARGO_BUILD_JOBS=2 cargo test --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-core --profile native-dev
CARGO_TARGET_DIR=/private/tmp/molfar-gpui-preparation-target CARGO_BUILD_JOBS=2 cargo test --offline --locked --manifest-path crates/monocode-gpui/Cargo.toml -p monocode-gpui --profile native-dev --no-run
```

The GPUI test command above compiles tests without executing UI/runtime. Core test fixtures require review before execution: no production database, credentials or real router mapping may be used. Any test requiring product runtime remains skipped until M01 identity/storage and M20 no-router isolation gates are implemented. Script tests use fake executables and synthetic data.

Never run native:dev, native:build (which bundles), application executables, publishing workflows, release signing or updater verification against production feeds during preparation. Builds do not establish runtime, data, platform or feature parity. Keep command exit codes and complete logs in the session report.

The first offline core test reproduced uncached alacritty_terminal (exit 101). Authorized locked network dependency fetch subsequently exited 0. This resolves that dependency-cache blocker, not compilation or runtime correctness.
