# Plan — Native session and board card usage

## Goal

Deliver durable session, board card and daily token accounting with reproducible cost estimates in GPUI.

## Technical Approach

Extend native accounting rather than implementing the previous React/Tauri proposal.

Introduce focused usage contracts and pure accounting functions under `crates/molfar-core/src/consumption/`, separate from the existing quota-oriented usage module. Reuse `TurnInfo` provenance and existing provider events where reliable, extending event payloads where presence or stable identity is lost.

Persist usage in a session-associated SQLite ledger under `crates/molfar-core/src/store/consumption/`. Transcript metrics remain compatible presentation data, not the accounting source of truth.

Each record contains:

- Persisted session identity and stable turn/run attempt identity.
- Provider source identity and optional provider event identity.
- Actual model identity, with multiple slices when the provider reports multiple models.
- Optional input, output, cache-read and cache-write counts.
- Reporting completeness and authoritative accounting scope.
- UTC attribution timestamp, timestamp provenance and selected pricing version.

Use a unique accounting key for idempotent upserts. Preserve keys through reload and reconnect. Never deduplicate solely by token values, timestamp or transcript position. Ambiguous replay data must remain explicitly incomplete rather than being blindly added.

Use checked fixed-point monetary arithmetic and round only for display. Retain immutable pricing versions and explicit model aliases. Unknown models and unsupported pricing dimensions remain unavailable.

## Architecture Overview

- **Providers:** Existing modules under `molfar-core/src/provider/` normalize authoritative usage into snapshots with stable identity. Distinguish consumption from context occupancy.
- **Runtime:** `molfar-gpui/src/runtime.rs` and focused runtime helpers associate reports with the active run and persist updates through the native store.
- **Core accounting:** `molfar-core/src/consumption/` owns validation, completeness, aggregation and pricing.
- **Store:** `store/consumption/` owns migrations, idempotent writes, legacy import and indexed queries. Use persisted session identifiers rather than transient native handles.
- **Board:** Resolve `StageRun.session_id` through existing store mappings. Retain attempt rows and deduplicate sessions for card totals.
- **GPUI:** Add focused consumption components for session chrome, `task_board/detail/` and a native panel accessible from Home. Existing quota widgets retain their data source and behavior.

## Risks & Mitigations

- **Snapshot/delta confusion:** Audit each adapter and test duplicate/replay behavior before enabling its consumption totals.
- **Parent/child or joined-turn overlap:** Define one authoritative accounting scope per provider run; never sum parent and child reports without proving disjoint coverage.
- **Zero versus absent:** Preserve field presence before adapters default counters to zero.
- **Transcript rewrites:** Store incurred consumption independently from transcript row lifetime.
- **Shared database compatibility:** Add tables without changing existing transcript contracts; test both native store modes and shared-database reopen.
- **Historical price drift:** Persist price-version selection; retain old entries.
- **Missing provenance:** Preserve known tokens and expose incomplete model/date coverage.
- **Slow views:** Batch board resolution, use indexed reads and paginated tables, and refresh after successful writes outside render.
- **Write failure:** Keep pending usage, expose the error and retry with the same identity.

## Execution Stages

### S1 — Audit native provider contracts

- Inspect `molfar-core/src/provider/`, `agent.rs` and existing fixtures.
- Record field presence, snapshot/delta semantics, identities, model provenance, nested usage inclusion and terminal/cancellation behavior for every native harness.
- Cover joined turns and repeated provider runs associated with one user prompt.
- Document unsupported or ambiguous reporting without inventing usage.

**Checkpoint:** A fixture-backed capability matrix identifies authoritative consumption sources.

### S2 — Establish durable native accounting

- Add focused contracts, validators and normalization under `molfar-core/src/consumption/`.
- Extend native events and runtime integration only where existing payloads lose required information.
- Implement additive ledger schema and indexed queries under `store/consumption/`, with wiring through `store.rs` and relevant schema initialization.
- Integrate writes with `molfar-gpui/src/runtime/persistence/`. Save usage and receipts transactionally where they share a boundary.
- Persist reported usage at existing bounded save cadence and flush at terminal boundaries, including failure and cancellation.
- Implement idempotent legacy backfill from trustworthy receipt/block identities; retain undated and unpriced states where necessary.
- Preserve existing transcript metric serialization.

**Checkpoint:** Zero reports, duplicate snapshots, replay, transcript edits, failed writes and database reopen preserve expected accounting.

### S3 — Add prices and aggregate queries

- Add immutable price versions under `consumption/pricing/`.
- Verify entries against official provider sources during implementation; record source URL, verification date, currency, units and supported cache dimensions.
- Implement checked token and cost aggregation.
- Add session, daily and board queries using all stage attempts.
- Include archived records within the selected project; paginate tables.
- Expose missing-session and partial-report coverage without silently treating missing data as zero.

**Checkpoint:** Golden fixtures prove cache treatment, mixed pricing coverage, stable price versions, deduplication and date grouping.

### S4 — Deliver GPUI surfaces

- Add a focused session consumption summary with exact token details.
- Add usage breakdown and totals under `task_board/detail/`.
- Add a native consumption panel accessible from Home with session/card tables and daily totals.
- Reuse native formatting, theme, scrolling and accessibility patterns.
- Implement loading, empty, unreported, partial, unavailable and persistence-error states.
- Refresh summaries after persisted updates without blocking rendering.
- Leave quota footer and Home quota widget behavior unchanged.

**Checkpoint:** GPUI tests verify labels, totals, navigation, project scope and reporting states.

### S5 — Verify and document

- Document provider coverage, historical-data limitations, date attribution and estimate semantics.
- Run targeted core/store/runtime/GPUI tests, followed by `npm run native:check`.
- Run applicable repository size, boundary and branding checks.
- Review the final diff for shared-store compatibility, error handling and unintended React/Tauri changes.
- Record runtime checks separately from automated evidence. Browser or interactive UI QA requires explicit authorization.

**Checkpoint:** Every acceptance criterion has evidence or a clearly identified unrun runtime check.

## Testing Strategy

- **Provider fixtures:** Two Claude turns; cumulative snapshots; true deltas; duplicate terminal events; reconnect replay; nested agents; model switches; joined turns; cancellation and errors.
- **Accounting:** Explicit zero versus absence, partial categories, invalid values, integer overflow, model aliases, cache inclusion, unknown prices and deterministic rounding.
- **Storage:** Additive migration, both native store modes, stable session identity, legacy backfill rerun, transactional failure, retry, transcript rewrite and database reopen.
- **Aggregation:** Repeated stage attempts, duplicate session references, missing sessions, archived records, project scope, midnight, daylight-saving transitions and undated legacy records.
- **GPUI:** Session summary, attempt breakdown, estimate labels, incomplete subtotals, panel navigation and unchanged quota data flow.
- **Final gate:** `npm run native:check` plus applicable repository structural checks. No implementation tests were run in this read-only planning round.

## Analyze Gate

Coverage:

- AC-1, AC-5, AC-8, AC-10: S1–S3.
- AC-2, AC-3, AC-4, AC-9: S3–S4.
- AC-6, AC-11, AC-12: S2–S3.
- AC-7, AC-13: S4–S5.

No uncovered requirements or orphan stages. The previous React/Tauri default and conditional GPUI branch are removed. No unresolved product ambiguities or constitution conflicts remain under the explicit read-only stage override.

**Verdict: PASS — draft ready for board approval.**

## Stage Evidence

HEAD and branch match the supplied checkout. Git status was clean before and after inspection. No files were created, modified, staged or committed. No browser was opened.