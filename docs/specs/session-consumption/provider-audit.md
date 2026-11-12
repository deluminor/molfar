# Native consumption investigation

This is a partial source audit, not a fixture-backed capability certification.

- ACP (`provider/acp.rs`, `usage_events`) detects optional fields but emits default-zero `TurnMetrics`. It supports explicit zero before normalization. Snapshot/delta and run identity need protocol fixtures.
- Pi (`provider/pi.rs`) adds message usage into run metrics. Missing categories become zero. Replay safety needs stable message identities before enabling capture.
- OpenCode (`provider/opencode/events.rs`) replaces per-message metrics and sums message snapshots. Missing categories become zero; nested scope and model switches need fixtures.
- Shared receipt writes fill absent transcript fields and gate metrics with `reported()`. Explicit zero may disappear; mutable snapshots cannot use that path as their ledger.

No adapter is enabled for ledger capture by this change. Existing context and quota paths remain untouched. Claude, Codex and Devin authoritative scope, terminal behavior and joined-run identity remain unverified.
- Claude (`provider.rs`, result usage): result counters replace metrics; all-zero results are suppressed by `reported()`. Model-specific slices are not preserved by this event.
- Codex (`provider.rs`, usage notification): adds `last` counters when total changes (or total is zero). This is not a durable replay identity; cached-input charging semantics require explicit normalization.
