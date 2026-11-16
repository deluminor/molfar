# Handoff: finish card #15 (session and board card usage + estimated cost)

Written 2026-11-13 by the previous session after a read-only investigation. Read `spec.md` in this
folder first, then this file. This file overrides `plan.md` where they differ.

## Mandate

The user asked: "finish everything so it is beautiful, designer-quality and senior" on this branch.
The approved product scope is `spec.md` (GPUI only, AC-1..AC-13). Follow the repo and global rules:
plan approval before code is covered by this handoff, but **confirm the two decisions marked
DECISION with the user in one short question round before coding**, then work stage by stage.

## Where things are

- Branch: `molfar/task-app063-show-token-usage-and-cost-per-session-an` (PR #144, open, CI green).
  `main` (including PR #145, board automation) is already merged into it. Work in the main checkout
  `/Users/deluminor/Documents/personal/developing/personal/projects/AI/molfar`; the old card worktree
  was removed by delivery. Always `git branch --show-current` before commit/push.
- Already on the branch (keep, adapt or delete deliberately):
  - `crates/molfar-core/src/consumption/mod.rs` — `UsageSnapshot` (presence-preserving counters).
  - `crates/molfar-core/src/store/consumption/{mod.rs,schema.sql,tests.rs}` — additive table
    `native_consumption_v1 (session_id, provider, source_key, model, reported_at_ms, input, output,
    cache_read, cache_write)`, idempotent upsert keeping the first report date, read per session.
  - `crates/molfar-core/src/provider/consumption.rs` — Claude `result` frame → snapshot (only Claude).
  - `crates/molfar-gpui/src/runtime/persistence.rs` — pending snapshots flushed with the session save.
  - Docs: `implementation-status.md`, `provider-audit.md`, `plan.md`, `tasks.md`.
- What already exists on `main` and must be reused, not duplicated:
  - `molfar_core::agent::TurnInfo` (`agent.rs:168`): provider, model, model_id, provider_turn_id,
    started_at/completed_at, completion, and `metrics: Option<TurnMetrics>`.
  - `TurnMetrics` (`agent.rs:198`): input, output, cache_read, cache_write, cache_hit_percent. Filled
    for **every** harness (Claude `provider.rs` result usage, Codex `thread/tokenUsage/updated` `last`
    counters at `provider.rs:~635`, ACP `acp.rs:1328`, OpenCode `opencode/events.rs:546`, Pi).
  - Turn receipt finalization: `crates/molfar-gpui/src/runtime.rs:~1099` (`turn_receipt`, completion
    classification) and `persistence::save_turn_receipt`.
  - Per-turn hover metrics UI: `crates/molfar-gpui/src/transcript.rs:~2410` ("Cache hit 99% · Output
    45 tok/s" + "6 input · 1.1K output · 1.8M cached"). Formatting helper `context::format_tokens`.
  - Quota surfaces (must stay unchanged): `home/widgets/usage.rs`, `home/widgets/usage_footer*`.
  - Board: `task_board_stage_runs(session_id original id, stage, attempt, status, started_at,
    completed_at)`. Since PR #145 Grill and Build (implement/continuations/rework) runs **share one
    session per section**; Code review runs always have their own session.
  - Card detail UI: `crates/molfar-gpui/src/task_board/detail/` (`metadata.rs`, `timeline.rs`,
    `groups.rs`, `tabs.rs`); Home widgets: `crates/molfar-gpui/src/home/widgets/`.

## Architecture (recommended)

1. **One capture path for all harnesses.** At turn finalization (`runtime.rs:~1099`), after the
   receipt has its final `metrics`, write one ledger record per turn. The current Claude-only
   `Event::Consumption` path only covers Claude, while the user's main harness is Codex. Replace it
   with the turn-level path and delete `provider/consumption.rs` + `Event::Consumption` (no dead code).
   - Stable identity: add `receipt_id: Option<String>` (UUID) to `TurnInfo`, set when the receipt
     opens (`runtime.rs:~268`), `serde(default)` so old transcripts load. Ledger `source_key` =
     `receipt_id`. Never use a transcript row index (edits/rewinds renumber rows).
   - Joined steer turns (`joined_turn`) belong to their root receipt: record once, under the root.
   - Interrupted/cancelled/failed turns record whatever metrics arrived (AC-2 counts them).
   - Write in its own small transaction next to the receipt save; on failure keep it pending in
     `PendingSave` for the cleanup retry (pattern already on the branch).
2. **Normalization per provider** (cost must never double-charge cache — AC-10):
   - Claude: `input` excludes cache; cache read and cache write (5-minute write) priced separately.
   - Codex/OpenAI: `inputTokens` **includes** `cachedInputTokens` → uncached input = input − cached.
   - Others (ACP, OpenCode, Pi, Grok, Devin): store as reported; price only models in the table.
   - Store raw counters plus the provider so normalization lives in pricing, not in capture.
3. **Reporting state.** DECISION A (ask the user): `TurnMetrics` counters default to zero, so absent
   categories and explicit zero are indistinguishable except via `reported()`. Options:
   (a, recommended) record turn-level presence only — "not reported" when `reported()` is false,
   otherwise all four counters are trusted; document that per-category absence is not tracked
   (relaxes AC-5's partial-category clause); (b) make counters `Option<u64>` across all adapters
   (large ripple through every provider and transcript serialization). Update `spec.md` to match.
4. **Legacy data (AC-11).** Old receipts in transcripts already carry `metrics` + `started_at`.
   Backfill lazily and idempotently per session on first consumption read (background), key
   `legacy:<started_at>:<provider_turn_id|index>`; skip receipts without metrics; mark them dated only
   when `started_at` exists. Never infer from context size or transcript length.
5. **Pricing (AC-3/4/10).** New `crates/molfar-core/src/consumption/prices.rs`: an immutable,
   versioned table (`PRICE_TABLE_VERSION`, effective date) of USD per million tokens for input,
   output, cache read, cache write, keyed by model id (and aliases from `catalog.rs`). Fill it **only
   from official pricing pages fetched during implementation** (Anthropic and OpenAI), with source
   URL and fetch date in `docs/specs/session-consumption/prices.md`. DECISION B (ask the user): which
   models to include — recommended: every model currently offered in the native model pickers for
   Claude and Codex; anything else shows "cost unavailable". Unknown model → cost `None`, never 0.
   Mixed coverage → known subtotal + "incomplete" flag. Compute cost on read with the current table
   version and show that version's date in the UI footnote; records store tokens, never dollars.
6. **Aggregation (store, background only, indexed):**
   - Session total: sum of the session's records (checked arithmetic, overflow → error).
   - Card total: union of the card's stage-run sessions, **each session counted once** (shared Build
     and Grill sessions!). Per-run breakdown: a run owns the session's records whose `reported_at_ms`
     falls in `[run.started_at, run.completed_at or now]`; records outside any run stay in the
     session/card total under "Other".
   - Daily totals: group by local calendar date of `reported_at_ms`; undated records only in totals.
   - Project scope: sessions whose `cwd` belongs to the project (reuse existing project matching).
   - Add indexes as needed (`session_id`, `reported_at_ms`). Additive migration only.
7. **UI (designer quality — load the `d-ui-ux-design` skill; follow `molfar-no-nested-card-modals`
   memory: native dialogs use `modal::sheet`, never nested bordered card stacks):**
   - **Session:** extend the existing per-turn hover card with a second line "Session · 1.2M tokens ·
     ~$3.40" and add a quiet session usage line in the session's info surface (find the existing
     session header/meta; do not touch quota footer behavior). Estimates always labeled "~" and
     "estimate" with the price-table date on hover.
   - **Board card detail (Overview tab):** a "Usage" block: total tokens and ~cost, then a compact
     per-run table (stage · attempt · model · tokens · ~cost · state), using the same row rhythm as
     `timeline.rs`. States: "Not reported", "Partial", "Cost unavailable", loading, error.
   - **Home:** a "Consumption" widget next to the quota widget: today / last 7 days totals with a
     small daily bar row, top 3 sessions and top 3 cards by cost, project scope toggle, opening a
     `modal::sheet` with full session/card tables (AC-13). Respect reduced motion; no new colors —
     use theme helpers (`content`, `accent_color`, `look::*`).
   - All data loads in the background; render only reads cached view state.
8. **Size and structure:** new modules under `consumption/` (types, prices, aggregate, legacy) and a
   GPUI `consumption/` UI folder; every file ≤ 250 lines; no comments that restate code.

## Stages (commit each separately; tests first where practical)

1. Turn-level capture + `receipt_id` + removal of the Claude-only path; ledger tests for idempotent
   replay, joined turns, interrupted turns, failure retry (AC-1, AC-8, AC-12).
2. Provider normalization + price table + cost computation with unknown/mixed coverage (AC-3/4/10).
3. Aggregation queries: session, card with shared-session dedupe and per-run windows, daily, project
   (AC-2, AC-6, AC-9); legacy backfill (AC-11).
4. UI: session hover + session line; board card Usage block; Home widget + sheet (AC-5, AC-13).
5. Docs: rewrite `implementation-status.md` (only verified claims), update `spec.md` for DECISION A/B,
   `prices.md`, `tasks.md`; architecture note in `docs/architecture/task-board.md` if board UI changes.

## Verification (must all pass before push)

- `cargo +1.100 clippy --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core -p
  molfar-gpui --all-targets --profile native-dev -- -D warnings` (CI uses Rust 1.100; local default
  is 1.98 — the 1.100 toolchain is installed).
- `cargo fmt --manifest-path crates/molfar-gpui/Cargo.toml --all --check`
- `cargo test --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-core --profile native-dev`
- `timeout 590 cargo test --manifest-path crates/molfar-gpui/Cargo.toml --locked -p molfar-gpui
  --profile native-dev -- --test-threads=1` (always with a timeout; a hung fake provider blocks forever)
- `npm run check:size`; the pre-push hook runs `npm run check:web` (needs `node_modules`).
- Windows: anything spawning processes or using paths must be cfg-correct; CI runs Windows core tests.
- Rewrite `implementation-status.md` with real numbers only. No claim without the command output.

## Delivery

Push to the PR branch, update PR #144's body (summary, scope, testing actually run), and tell the
user what changed in plain Ukrainian. Do not merge. Card #15 on the Board is still at Final review
with this PR; leave the card alone unless the user asks.
