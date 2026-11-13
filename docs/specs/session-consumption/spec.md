---
pr_title: "feat(usage): show native session and board card tokens and estimated cost"
---
# Spec — Native session and board card usage

## Problem

The user needs persistent token consumption and estimated cost attributable to individual sessions and Task Board cards. Existing provider quota displays do not provide this accounting.

## Settled scope

The user selected **GPUI only** in round 1. Implement capture, persistence, aggregation and presentation in `molfar-core` and `molfar-gpui`. The React paths in the original ticket are background references, not implementation targets.

Retain the previous draft’s accounting requirements: durable usage records, session/card/day roll-ups, versioned local pricing, explicit reporting completeness and unchanged quota behavior.

## Repository evidence

Verified at base `570a3a2fb315ecbd47574e64af2489f49c2ebc1c`:

- `crates/molfar-core/src/agent.rs` defines `TurnInfo` with provider/model identity, turn identity, timestamps and optional `TurnMetrics`.
- `TurnMetrics` uses default-zero counters. Its `reported()` predicate does not distinguish an explicitly reported all-zero result from absent metrics unless another field is present.
- `crates/molfar-gpui/src/runtime.rs` replaces the active receipt’s metrics on `Event::Metrics`; context occupancy has a separate event.
- `crates/molfar-core/src/store/shared/turn_receipts/write.rs` writes metrics into transcript blocks only when `reported()` succeeds and fills absent fields. This path alone is insufficient for mutable usage snapshots and durable historical accounting.
- `crates/molfar-core/src/task_board/types.rs` exposes stage attempts and optional session references.
- Native quota presentation exists in `usage_footer.rs` and Home’s usage widget. These remain quota surfaces; consumption needs an additive native surface.

These findings establish integration points, not verified provider accuracy.

## Acceptance criteria

- **AC-1 — Session totals:** Two completed Claude turns produce session input, output, cache-read and cache-write totals equal to authoritative adapter reports.
- **AC-2 — Board attribution:** Card detail shows every stage attempt and total usage, including reported consumption from failed, interrupted and rework attempts. Each session contributes once to the card total; repeated references do not inflate it.
- **AC-3 — Known prices:** Fully priceable records show a USD amount labeled “estimate,” calculated with recorded model identity and an immutable price-table version.
- **AC-4 — Unknown prices:** Unknown models retain tokens and show cost unavailable, never zero. Mixed coverage shows a labeled known-cost subtotal and incomplete coverage.
- **AC-5 — Reporting state:** Missing reports show “usage not reported.” Explicit zero remains distinguishable from absence. Missing token categories remain unknown; partial reports are labeled partial.
- **AC-6 — Persistence:** After successful persistence and database reopen, session, stage, card and daily totals remain unchanged. Transcript edits and rewinds do not erase incurred consumption.
- **AC-7 — Existing behavior:** Native provider quota, rate-limit and context-window displays preserve their behavior. React/Tauri code remains untouched.
- **AC-8 — Idempotency:** Duplicate events, repeated terminal events and reconnect replay do not increase totals. Cumulative snapshots replace the same record; genuine deltas use stable source identities.
- **AC-9 — Daily grouping:** Persist UTC timestamps and group by the current local calendar date. Attribute each record to its first authoritative usage-report timestamp, using trustworthy historical timestamps for legacy records. Records without trustworthy dates remain undated. Session and card views are alternative projections, not additive datasets.
- **AC-10 — Model and cache semantics:** Preserve actual model provenance per usage slice. Do not charge cached input twice. Unsupported pricing dimensions make the affected estimate unavailable.
- **AC-11 — Legacy data:** Retain trustworthy historical metrics without inventing missing model, date or category information. Never infer consumption from context size or transcript length.
- **AC-12 — Failure handling:** Reject invalid counts and checked-arithmetic overflow with diagnostic context. Surface persistence failures, retain pending writes for retry and preserve previously saved usage.
- **AC-13 — Native surfaces:** Show a session summary, card attempt breakdown and total, plus project-scoped session/card tables and daily totals in a native consumption panel accessible from Home. Support loading, empty, partial, unavailable and error states.

## Constraints

- Reuse native runtime, turn receipts, store and board boundaries.
- Use an additive SQLite migration compatible with the shared desktop database. No Tauri commands or TypeScript implementation.
- Use indexed aggregate reads outside GPUI render paths; avoid scanning all transcripts on each render.
- Keep focused new modules within repository size rules; extend large existing files only with minimal wiring.
- No new dependency unless existing libraries cannot meet the requirement.
- Store finite, nonnegative integer token counts. Preserve field presence.
- Pricing is bundled and versioned; no runtime network pricing fetch.
- Diagnostics contain identifiers and error context, not secrets or transcript content.
- This planning stage is read-only. MOLFAR persists these blocks.

## Out of scope

React/Tauri and mobile delivery, remote-host consumption collection, invoice reconciliation, budgets or automatic limits, quota-fetch changes, token inference and external provider-history imports.

## Risks

Provider snapshot/delta differences, parent/child overlap, joined turns, missing model provenance, unsupported cache tiers, shared-store compatibility and transcript mutation can corrupt totals. The implementation must resolve these through explicit contracts and fixtures before exposing estimates.

## Decisions (2026-11-13)

- **DECISION A — reporting presence is tracked per run, not per category.** A run whose receipt
  has no reported metrics is "not reported"; otherwise all four counters are trusted. Explicit zero
  stays distinct from absence at run level. Per-category absence is not tracked, which relaxes
  AC-5's "missing token categories remain unknown" clause. Partial means some runs of a projection
  reported nothing.
- **DECISION B — priced models.** Every model offered in the native Claude and Codex pickers on
  2026-11-13, from the official Anthropic and OpenAI pricing pages (`prices.md`). Anything else,
  and runs from other harnesses, shows tokens with "cost unavailable".

## Open decisions

None.