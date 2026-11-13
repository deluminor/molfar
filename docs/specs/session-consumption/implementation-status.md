# Implementation status

Card #15 scope (spec AC-1…AC-13) is implemented on the branch as of 2026-11-13. Every claim
below is backed by a test or a command run listed at the end. The agent did no interactive UI QA;
an owner smoke test in the running app is still open.

## How it works

1. **Capture** (`runtime.rs`, `runtime/persistence.rs`). Each provider run gets a `receipt_id`
   (UUID) when its receipt opens. At finalization — success, failure or cancel — one ledger record
   is written from the receipt: harness, model id and name, start and report time, raw counters
   (or none when nothing was reported). Joined steers are skipped; their usage belongs to the root
   run. The Claude-only `Event::Consumption` path is gone.
2. **Ledger** (`store/consumption/`). Additive tables `native_consumption_v1` (primary key
   `session_id, source_key`) and `native_consumption_sync_v1`, created on first write. A replayed
   report replaces its row and keeps the first report date. Counters are all present or all null
   (CHECK constraint). Invalid counts and overflow fail with the source id in the error; earlier
   rows stay.
3. **Reconciliation** (`store/consumption/reconcile.rs`). Before a projection is read, sessions
   whose transcript revision (`updated_at`) changed since the last import have their saved
   receipts imported with `INSERT … DO NOTHING`. Live receipts reuse `receipt_id` (persisted in
   the transcript as `nativeReceiptId`), so a failed live write is recovered and nothing doubles.
   Older receipts are keyed `legacy:<startedAt>`; receipts without a start time are skipped (no
   trustworthy date or identity). Nothing is inferred from context size or transcript length.
   Rows are never deleted, so edits and rewinds keep incurred usage. Read-only stores skip import.
4. **Pricing** (`consumption/prices.rs`, `pricing.rs`, `prices.md`). Versioned table
   `2026-11-13`; cost is computed on read, never stored. Codex cached input is carved out of
   input. Unknown models, other harnesses, Haiku 5.5 (prompt-length tiers) and Codex cache writes
   are unavailable, never zero. Mixed coverage gives a labelled known subtotal (`~$3.40+`).
5. **Aggregation** (`consumption/aggregate.rs`, `summary.rs`, `store/consumption/views.rs`).
   Checked sums. Card totals count each stage-run session once; a run owns the records that
   started inside `[run.started_at, run.completed_at or now]`, the rest are "Other". Daily totals
   use the local calendar date of the report time; undated records count only in totals. Project
   scope matches session and card `cwd` by path key.
6. **UI** (GPUI). Session chip beside the context meter (`conversation/usage.rs`) with a hover
   card; a "Session · …" line under each turn's metrics hover; Board card Overview "Usage" block
   (`task_board/detail/usage.rs`); Home "Consumption" widget (today, 7 days, daily bars, top
   sessions and cards, Project/All scope) and a `modal::sheet` with daily, session and card tables
   (`home/widgets/consumption/`). Loads run in the background and render reads cached state;
   the last good value stays during refresh. Reduced motion disables bar growth. Quota widgets,
   rate limits and the context meter are unchanged.

## Acceptance criteria

| AC | Status | Evidence |
| --- | --- | --- |
| AC-1 session totals | done | `record_tests`, board fake-Codex run `every_stage_run_records_one_ledger_entry_in_its_session` |
| AC-2 board attribution | done | `shared_build_session_counts_once_and_splits_by_run_window`, `card_usage_counts_the_shared_build_session_once`, `interrupted_runs_without_reports_stay_visible_as_unreported` |
| AC-3 known prices | done | `claude_prices_every_category_once…`, `codex_cached_input_is_carved_out…` |
| AC-4 unknown prices | done | `unknown_models_unsupported_dimensions_and_other_harnesses_stay_unavailable`, `mixed_coverage_keeps_a_known_subtotal…` |
| AC-5 reporting state | done, relaxed by DECISION A | `empty_unreported_and_complete_projections_are_distinct`, `headlines_name_every_reporting_state` |
| AC-6 persistence | done | `replayed_reports_replace_one_row…after_reopen`, `rewinding_history_keeps_incurred_usage` |
| AC-7 existing behavior | done | quota/context code untouched; full GPUI suite green |
| AC-8 idempotency | done | replay tests above, `live_receipts_reconcile_under_their_own_key_without_double_counting` |
| AC-9 daily grouping | done | `days_follow_the_local_calendar_and_skip_undated_records`, `recent_keeps_seven_days…` |
| AC-10 model and cache | done with limits | per-run model only; standard tier only (see `prices.md`) |
| AC-11 legacy data | done | `legacy_receipts_import_once_with_trustworthy_dates_only` |
| AC-12 failure handling | done | `database_failure_reports_context…`, `overflowing_totals_fail…`, `invalid_counts_are_rejected…` |
| AC-13 native surfaces | done, no interactive QA | `consumption_widget_opens_top_sessions_and_cards`, `consumption_states_and_sheet_open_and_close`, `overview_shows_card_total_and_every_attempt_including_unreported` |

## Known limits

- Per-category absence is not tracked (DECISION A).
- Claude `modelUsage` slices (e.g. subagent models) are not split; a run is priced at its
  receipt model.
- Fast/priority tiers, 1-hour Claude cache writes and long-context tiers are not recorded per run.
- Turns run by the desktop (Tauri) app have no receipt id; they are imported as legacy records
  keyed by start time.
- Remote sessions show no usage chip; remote collection is out of scope.

## Verification (2026-11-13, final run)

- `cargo +1.100 clippy … -p molfar-core -p molfar-gpui --all-targets --profile native-dev -- -D warnings`: exit 0.
- `cargo fmt … --all --check`: exit 0.
- `cargo test … -p molfar-core --profile native-dev`: 956 passed, 2 ignored. One earlier run had
  `host::tests::a_second_sample_reports_cpu_and_sane_memory` fail under load; it passed in
  isolation and in the final run (CPU sampler timing, unrelated to this change).
- `timeout 590 cargo test … -p molfar-gpui --profile native-dev -- --test-threads=1`: 1146 passed,
  11 ignored; integration target 6 passed.
- `npm run check:size`: exit 0.
- No interactive app run, browser or screenshot QA was performed.
