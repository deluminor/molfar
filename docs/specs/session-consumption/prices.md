# Price table `2026-11-13`

Bundled in `crates/molfar-core/src/consumption/prices.rs` (`PRICE_TABLE_VERSION`). Records store
tokens only; cost is computed on read with this table. A price change is a new table version.

Fetched on 2026-11-13 from the vendors' official pages:

- Anthropic: <https://platform.claude.com/docs/en/about-claude/pricing> ("Model pricing" table).
- OpenAI: <https://developers.openai.com/api/docs/pricing> ("Flagship models › Standard",
  short context ≤ 272K input tokens).

Scope (DECISION B): every model offered in the native Claude and Codex model pickers on that date.

## Anthropic — USD per million tokens

| Model | Input | Cache write (5 min) | Cache read | Output |
| --- | --- | --- | --- | --- |
| Fable 5.2 | 8 | 10 | 0.20 | 40 |
| Fable 5.1 | 10 | 12.50 | 0.25 | 50 |
| Fable 5 | 10 | 12.50 | 1 | 50 |
| Opus 5.5 | 4 | 5 | 0.20 | 20 |
| Opus 5 / 4.8 / 4.7 / 4.6 | 5 | 6.25 | 0.50 | 25 |
| Sonnet 5.5 | 2 | 2.50 | 0.10 | 10 |
| Sonnet 5 | 2 | 2.50 | 0.20 | 10 |
| Sonnet 4.6 | 3 | 3.75 | 0.30 | 15 |
| Haiku 4.5 | 1 | 1.25 | 0.10 | 5 |

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

## Rules and known limits

- Only runs reported by the Claude and Codex harnesses are priced. Other harnesses (Cursor, ACP,
  OpenCode, Pi, Grok, Devin) bill through their own plans: tokens are shown, cost is unavailable.
- Codex `inputTokens` includes `cachedInputTokens`; uncached input = input − cached. Claude input
  excludes both cache counters. Cache is never charged twice.
- Claude aliases (`opus`, `sonnet`, `fable`) resolve through the receipt's display name
  (`Opus 5.5`). An alias without a versioned name stays unpriced.
- Haiku 5.5 is not priced: its rate depends on each request's prompt length (>100K), which a turn
  total cannot reveal.
- Claude cache writes use the 5-minute rate; runs that wrote 1-hour cache are under-estimated.
- Codex cache writes have no OpenAI price; a Codex run reporting them is unpriced.
- Fast/priority, batch, regional and long-context (>272K per request) tiers are not recorded per
  run, so estimates use the standard tier. GPT-5.6 Sol's promotional price (until 2026-11-30) is
  not published as a rate and is not applied.
