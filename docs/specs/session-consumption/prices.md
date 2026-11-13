# Price table v2 (`2026-11-13`)

Bundled in `crates/molfar-core/src/consumption/prices.rs` (`PRICE_TABLE_VERSION = 2`,
`PRICES_AS_OF`). v2 adds one-hour cache writes and the fast/flex tiers. Records store
tokens only; cost is computed on read with this table. A price change is a new table version.

Fetched on 2026-11-13 from the vendors' official pages:

- Anthropic: <https://platform.claude.com/docs/en/about-claude/pricing> ("Model pricing" table)
  and <https://platform.claude.com/docs/en/build-with-claude/fast-mode>.
- OpenAI: <https://developers.openai.com/api/docs/pricing> ("Flagship models › Standard",
  short context ≤ 272K input tokens).

Scope (DECISION B): every model offered in the native Claude and Codex model pickers on that date.

## Anthropic — USD per million tokens

| Model | Input | Cache write 5 min | Cache write 1 h | Cache read | Output |
| --- | --- | --- | --- | --- | --- |
| Fable 5.2 | 8 | 10 | 16 | 0.20 | 40 |
| Fable 5.1 | 10 | 12.50 | 20 | 0.25 | 50 |
| Fable 5 | 10 | 12.50 | 20 | 1 | 50 |
| Opus 5.5 | 4 | 5 | 8 | 0.20 | 20 |
| Opus 5 / 4.8 / 4.7 / 4.6 | 5 | 6.25 | 10 | 0.50 | 25 |
| Sonnet 5.5 | 2 | 2.50 | 4 | 0.10 | 10 |
| Sonnet 5 | 2 | 2.50 | 4 | 0.20 | 10 |
| Sonnet 4.6 | 3 | 3.75 | 6 | 0.30 | 15 |
| Haiku 4.5 | 1 | 1.25 | 2 | 0.10 | 5 |

Fast mode (`usage.speed = "fast"`): the page lists input/output only; cache prices apply the
published multipliers (1.25× / 2× / model read rate) to the fast input price, per "prompt caching
multipliers apply on top of fast mode pricing".

| Model (fast) | Input | Cache write 5 min | Cache write 1 h | Cache read | Output |
| --- | --- | --- | --- | --- | --- |
| Fable 5.2 | 16 | 20 | 32 | 0.40 | 80 |
| Opus 5.5 | 8 | 10 | 16 | 0.40 | 40 |
| Opus 5 / 4.8 | 10 | 12.50 | 20 | 1 | 50 |

## OpenAI — USD per million tokens (standard tier)

| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-6.1-sol | 2.00 | 0.10 | 10.00 |
| gpt-6.1-terra | 1.00 | 0.05 | 5.00 |
| gpt-6-sol | 2.00 | 0.20 | 10.00 |
| gpt-6-astra | 10.00 | 1.00 | 50.00 |
| gpt-6-luna | 0.10 | 0.01 | 0.50 |
| gpt-5.6-sol | 4.00 | 0.40 | 20.00 |
| gpt-5.6-terra | 2.00 | 0.20 | 12.00 |
| gpt-5.6-luna | 0.20 | 0.02 | 1.20 |

Fast tier (formerly Priority) and Flex tier, short context:

| Model | Fast input / cached / output | Flex input / cached / output |
| --- | --- | --- |
| gpt-6.1-sol | 4.00 / 0.20 / 20.00 | 1.00 / 0.05 / 5.00 |
| gpt-6.1-terra | 2.00 / 0.10 / 10.00 | 0.50 / 0.025 / 2.50 |
| gpt-6-sol | 4.00 / 0.40 / 20.00 | 1.00 / 0.10 / 5.00 |
| gpt-6-astra | 20.00 / 2.00 / 100.00 | 5.00 / 0.50 / 25.00 |
| gpt-6-luna | 0.20 / 0.02 / 1.00 | 0.05 / 0.005 / 0.25 |
| gpt-5.6-sol | 8.00 / 0.80 / 40.00 | 2.00 / 0.20 / 10.00 |
| gpt-5.6-terra | 4.00 / 0.40 / 24.00 | 1.00 / 0.10 / 6.00 |
| gpt-5.6-luna | 0.40 / 0.04 / 2.40 | 0.10 / 0.01 / 0.60 |

## Rules and known limits

- Only runs reported by the Claude and Codex harnesses are priced. Other harnesses (Cursor, ACP,
  OpenCode, Pi, Grok, Devin) bill through their own plans: tokens are shown, cost is unavailable.
- Codex `inputTokens` includes `cachedInputTokens`; uncached input = input − cached. Claude input
  excludes both cache counters. Cache is never charged twice.
- Claude aliases (`opus`, `sonnet`, `fable`) resolve through the receipt's display name
  (`Opus 5.5`). An alias without a versioned name stays unpriced.
- Haiku 5.5 is not priced: its rate depends on each request's prompt length (>100K), which a turn
  total cannot reveal.
- Claude cache writes are split by lifetime from `modelUsage`. Writes with an unknown lifetime
  (history before v2, runs without a result frame) use the one-hour rate: Claude Code caches for
  an hour (owner decision, 2026-11-13).
- Codex cache writes have no OpenAI price; a Codex run reporting them is unpriced.
- Tier: Claude uses the reported `usage.speed`; Codex uses the requested `serviceTier` (or the
  fast toggle). Runs without a recorded tier are priced as standard. Tiers without a published
  rate (e.g. Ultrafast, Sonnet fast) are unavailable.
- Batch, regional and long-context (>272K per request) pricing is not applied. GPT-5.6 Sol's
  promotional price (until 2026-11-30) is not published as a rate and is not applied.
