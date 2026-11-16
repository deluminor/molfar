# Provider usage semantics

Capture no longer parses provider frames. The ledger records each finalized turn receipt's
`TurnMetrics`, which every harness already fills (`provider.rs`, `acp.rs`, `pi.rs`,
`opencode/events.rs`). What the counters mean per harness:

| Harness | Counters per run | Cache semantics | Priced |
| --- | --- | --- | --- |
| Claude | `modelUsage` per model (fallback: `result.usage`) + `usage.speed` | input excludes cache; writes split 5 min / 1 h | yes |
| Codex | sum of `last` counters; tier from requested `serviceTier` | `inputTokens` includes `cachedInputTokens` | yes |
| ACP (Cursor, Grok, …) | adapter usage update | stored as reported | no |
| OpenCode | sum of per-message metrics | stored as reported | no |
| Pi | sum of message usage | stored as reported | no |

Normalization lives in `consumption/pricing.rs::normalized`; capture stores raw counters plus the
harness. A run without any reported counter is stored with null counters ("not reported").

Cursor (ACP) reports no token usage at all (verified 2026-11-13 with `cursor-agent acp`: no
`usage_update`, no `usage` in the prompt response); only its headless `-p` mode does. See
`prices.md` for pricing limits.
