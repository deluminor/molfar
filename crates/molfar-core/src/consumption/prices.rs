/// Bundled, immutable price table. A new price set is a new version, never an edit.
/// Sources and fetch date: docs/specs/session-consumption/prices.md.
pub const PRICE_TABLE_VERSION: &str = "2026-11-13";

/// USD per million tokens, scaled by 1_000_000 so every listed price is an integer.
pub type MicroUsdPerMillion = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Vendor {
    Anthropic,
    OpenAi,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ModelPrice {
    pub vendor: Vendor,
    /// Normalized model key, see `pricing::model_key`.
    pub key: &'static str,
    pub input: MicroUsdPerMillion,
    pub output: MicroUsdPerMillion,
    pub cache_read: MicroUsdPerMillion,
    /// `None` when the vendor has no cache-write price; such writes make a cost unavailable.
    pub cache_write: Option<MicroUsdPerMillion>,
}

const fn usd(dollars: u64, micro: u64) -> MicroUsdPerMillion {
    dollars * 1_000_000 + micro
}

const fn anthropic(
    key: &'static str,
    input: MicroUsdPerMillion,
    cache_write_5m: MicroUsdPerMillion,
    cache_read: MicroUsdPerMillion,
    output: MicroUsdPerMillion,
) -> ModelPrice {
    ModelPrice {
        vendor: Vendor::Anthropic,
        key,
        input,
        output,
        cache_read,
        cache_write: Some(cache_write_5m),
    }
}

const fn openai(
    key: &'static str,
    input: MicroUsdPerMillion,
    cached_input: MicroUsdPerMillion,
    output: MicroUsdPerMillion,
) -> ModelPrice {
    ModelPrice {
        vendor: Vendor::OpenAi,
        key,
        input,
        output,
        cache_read: cached_input,
        cache_write: None,
    }
}

/// Haiku 5.5 is absent on purpose: its price depends on each request's prompt length,
/// which a turn total cannot reveal.
pub const PRICES: &[ModelPrice] = &[
    anthropic(
        "fable-5-2",
        usd(8, 0),
        usd(10, 0),
        usd(0, 200_000),
        usd(40, 0),
    ),
    anthropic(
        "fable-5-1",
        usd(10, 0),
        usd(12, 500_000),
        usd(0, 250_000),
        usd(50, 0),
    ),
    anthropic(
        "fable-5",
        usd(10, 0),
        usd(12, 500_000),
        usd(1, 0),
        usd(50, 0),
    ),
    anthropic(
        "opus-5-5",
        usd(4, 0),
        usd(5, 0),
        usd(0, 200_000),
        usd(20, 0),
    ),
    anthropic(
        "opus-5",
        usd(5, 0),
        usd(6, 250_000),
        usd(0, 500_000),
        usd(25, 0),
    ),
    anthropic(
        "opus-4-8",
        usd(5, 0),
        usd(6, 250_000),
        usd(0, 500_000),
        usd(25, 0),
    ),
    anthropic(
        "opus-4-7",
        usd(5, 0),
        usd(6, 250_000),
        usd(0, 500_000),
        usd(25, 0),
    ),
    anthropic(
        "opus-4-6",
        usd(5, 0),
        usd(6, 250_000),
        usd(0, 500_000),
        usd(25, 0),
    ),
    anthropic(
        "sonnet-5-5",
        usd(2, 0),
        usd(2, 500_000),
        usd(0, 100_000),
        usd(10, 0),
    ),
    anthropic(
        "sonnet-5",
        usd(2, 0),
        usd(2, 500_000),
        usd(0, 200_000),
        usd(10, 0),
    ),
    anthropic(
        "sonnet-4-6",
        usd(3, 0),
        usd(3, 750_000),
        usd(0, 300_000),
        usd(15, 0),
    ),
    anthropic(
        "haiku-4-5",
        usd(1, 0),
        usd(1, 250_000),
        usd(0, 100_000),
        usd(5, 0),
    ),
    openai("gpt-6-1-sol", usd(2, 0), usd(0, 100_000), usd(10, 0)),
    openai("gpt-6-1-terra", usd(1, 0), usd(0, 50_000), usd(5, 0)),
    openai("gpt-6-sol", usd(2, 0), usd(0, 200_000), usd(10, 0)),
    openai("gpt-6-astra", usd(10, 0), usd(1, 0), usd(50, 0)),
    openai(
        "gpt-6-luna",
        usd(0, 100_000),
        usd(0, 10_000),
        usd(0, 500_000),
    ),
    openai("gpt-5-6-sol", usd(4, 0), usd(0, 400_000), usd(20, 0)),
    openai("gpt-5-6-terra", usd(2, 0), usd(0, 200_000), usd(12, 0)),
    openai(
        "gpt-5-6-luna",
        usd(0, 200_000),
        usd(0, 20_000),
        usd(1, 200_000),
    ),
];
