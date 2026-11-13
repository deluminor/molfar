# Provider usage semantics

Capture no longer parses provider frames. The ledger records each finalized turn receipt's
`TurnMetrics`, which every harness already fills (`provider.rs`, `acp.rs`, `pi.rs`,
`opencode/events.rs`). What the counters mean per harness:

| Harness | Counters per run | Cache semantics | Priced |
| --- | --- | --- | --- |
| Claude | `result.usage` totals for the run | input excludes cache read and write | yes |
| Codex | sum of `last` counters across the turn | `inputTokens` includes `cachedInputTokens` | yes |
| ACP (Cursor, Grok, …) | adapter usage update | stored as reported | no |
| OpenCode | sum of per-message metrics | stored as reported | no |
| Pi | sum of message usage | stored as reported | no |

Normalization lives in `consumption/pricing.rs::normalized`; capture stores raw counters plus the
harness. A run without any reported counter is stored with null counters ("not reported").

Known limits: Claude `modelUsage` per-model slices are not kept, so a run is priced at the
receipt's model. Service tier (fast/priority) is not recorded per run; estimates use the standard
tier. See `prices.md`.
