# Native consumption investigation

This is a partial source audit, not a fixture-backed capability certification.

- ACP (`provider/acp.rs`, `usage_events`) detects optional fields but emits default-zero `TurnMetrics`. It supports explicit zero before normalization. Snapshot/delta and run identity need protocol fixtures.
- Pi (`provider/pi.rs`) adds message usage into run metrics. Missing categories become zero. Replay safety needs stable message identities before enabling capture.
- OpenCode (`provider/opencode/events.rs`) replaces per-message metrics and sums message snapshots. Missing categories become zero; nested scope and model switches need fixtures.
- Shared receipt writes fill absent transcript fields and gate metrics with `reported()`. Explicit zero may disappear; mutable snapshots cannot use that path as their ledger.

Claude terminal result capture is now connected for reports with a stable result UUID. Other adapters remain disabled for ledger capture. Existing context and quota paths remain untouched. Codex and Devin authoritative scope and replay identity remain unverified. Claude interrupted runs without a result remain uncovered.
- Claude (`provider.rs`, result usage): result counters replace metrics; all-zero results are suppressed by `reported()`. Model-specific slices are not preserved by this event.
- Codex (`provider.rs`, usage notification): adds `last` counters when total changes (or total is zero). This is not a durable replay identity; cached-input charging semantics require explicit normalization.

## Rework capture contract

Claude parent result frames with a nonempty UUID and a usage object emit presence-preserving snapshots. The result UUID, scoped by persisted session and provider, is the replacement key. Child frames are excluded, preventing parent/child double counting. A single modelUsage key supplies model identity; multiple models leave aggregate identity unknown rather than inventing a priceable model. Missing UUID or usage emits no accounting record. Invalid present counts fail with field and source context.

The GPUI runtime queues these snapshots at the existing bounded persistence cadence and flushes at terminal cleanup. Duplicate keys replace pending snapshots; failed writes retain pending records for the existing cleanup retry. Writes remain separate from transcript transactions. Process termination before a successful write can still lose pending records.

Fixtures cover explicit zero, missing cache categories, duplicate result identity, unknown mixed-model provenance, negative/overflow counts and nested/anonymous exclusions. These synthetic protocol fixtures do not establish live provider parity or coverage of failed/cancelled runs without terminal usage.
