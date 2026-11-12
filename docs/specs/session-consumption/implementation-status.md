# Implementation status

This change is a partial foundation. Card #15 is not complete.

## Delivered

- Presence-preserving snapshot contract, separate from default-zero transcript metrics.
- Additive, transactional SQLite ledger with stable persisted session and provider/source keys.
- Idempotent snapshot replacement and first-known-report timestamp retention.
- Checked SQLite integer boundaries and contextual read/write errors.
- Read-only queries return empty data without creating schema on old databases.
- Five tests cover duplicate snapshots, mutable snapshots, explicit zero, absent fields, reopen, shared session identity, rejected counts, database failure and retry.

Schema creation occurs transactionally on first ledger write. Existing databases are untouched until a caller explicitly writes consumption. This API accepts authoritative snapshots only; no adapter has yet been certified or connected.

## Outstanding approved scope

Complete the fixture-backed provider audit; define run/slice identity, completeness, accounting scope and timestamp provenance; normalize provider reports; integrate bounded runtime persistence and pending retries; backfill trustworthy legacy receipts; add checked aggregation and immutable verified prices; implement project/session/card/day queries and GPUI surfaces. No acceptance criterion is claimed complete end to end.

The initial TDD run failed because the consumption contract and store API did not exist. Subsequent compilation exposed unsigned SQLite conversions and a statement lifetime error; both were corrected before the passing focused run.

No browser or interactive runtime QA was performed. No prices were introduced, so official pricing verification remains outstanding. No React/Tauri code, quota data source or existing transcript serialization was changed.

## Verification evidence

- Focused ledger suite: 5 passed, exit 0.
- `npm run check:size`, `npm run check:boundaries`, `npm run check:native-branding`: exit 0.
- `cargo fmt --manifest-path crates/molfar-gpui/Cargo.toml --all --check`: exit 0.
- Native Clippy for core and GPUI, all targets with `-D warnings`: exit 0.
- Initial full gate: exit 101; core reported 877 passed, 15 failed, 2 ignored under sandbox restrictions.
- Permitted full-gate retry: core 892 passed, 2 ignored. GPUI result recorded separately after completion.
- Staged secret scanner and diff whitespace check: exit 0.
- Dependency warning: `block v0.1.6` future Rust incompatibility.
- No coverage configuration or separate dependency audit was run. Interactive runtime checks remain unrun.

### Final permitted gate

`npm run native:check` exited 101. Native development scripts passed (44 tests), format and Clippy passed, core passed (892 tests, 2 ignored). GPUI reported 1122 passed, 1 failed, 11 ignored. The failing test was `shell::tests::explorer_files_share_the_review_pane_and_dirty_close_can_cancel_or_save`, at `src/shell.rs:12441:49`, with `StorageFull: No space left on device`. The full gate is not green. No unrelated files were deleted to reclaim space. No end-to-end acceptance criterion is marked complete.
