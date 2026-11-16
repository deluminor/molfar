/// Bundled, immutable price table. A new price set is a new version, never an edit.
/// Sources and fetch date: docs/specs/session-consumption/prices.md.
pub const PRICE_TABLE_VERSION: u32 = 2;
pub const PRICES_AS_OF: &str = "2026-11-13";

/// USD per million tokens, scaled by 1_000_000 so every listed price is an integer.
pub type MicroUsdPerMillion = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Vendor {
    Anthropic,
    OpenAi,
}

/// Processing tier a run was billed at; Anthropic calls fast mode `speed: fast`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tier {
    Standard,
    Fast,
    Flex,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ModelPrice {
    pub vendor: Vendor,
    /// Normalized model key, see `pricing::model_key`.
    pub key: &'static str,
    pub tier: Tier,
    pub input: MicroUsdPerMillion,
    pub output: MicroUsdPerMillion,
    pub cache_read: MicroUsdPerMillion,
    /// Five-minute cache write; `None` when the vendor has no cache-write price.
    pub cache_write: Option<MicroUsdPerMillion>,
    pub cache_write_1h: Option<MicroUsdPerMillion>,
}

const fn usd(dollars: u64, micro: u64) -> MicroUsdPerMillion {
    dollars * 1_000_000 + micro
}

/// Anthropic writes cost 1.25× (5 min) and 2× (1 h) input; the read rate varies by model.
const fn anthropic(
    key: &'static str,
    tier: Tier,
    input: MicroUsdPerMillion,
    cache_read: MicroUsdPerMillion,
    output: MicroUsdPerMillion,
) -> ModelPrice {
    ModelPrice {
        vendor: Vendor::Anthropic,
        key,
        tier,
        input,
        output,
        cache_read,
        cache_write: Some(input / 4 * 5),
        cache_write_1h: Some(input * 2),
    }
}

const fn openai(
    key: &'static str,
    tier: Tier,
    input: MicroUsdPerMillion,
    cached_input: MicroUsdPerMillion,
    output: MicroUsdPerMillion,
) -> ModelPrice {
    ModelPrice {
        vendor: Vendor::OpenAi,
        key,
        tier,
        input,
        output,
        cache_read: cached_input,
        cache_write: None,
        cache_write_1h: None,
    }
}

use Tier::{Fast, Flex, Standard};

/// Haiku 5.5 is absent on purpose: its price depends on each request's prompt length,
/// which a turn total cannot reveal. Fast-mode cache prices apply the published multipliers
/// to the fast input price ("multipliers apply on top of fast mode pricing").
pub const PRICES: &[ModelPrice] = &[
    anthropic(
        "fable-5-2",
        Standard,
        usd(8, 0),
        usd(0, 200_000),
        usd(40, 0),
    ),
    anthropic(
        "fable-5-1",
        Standard,
        usd(10, 0),
        usd(0, 250_000),
        usd(50, 0),
    ),
    anthropic("fable-5", Standard, usd(10, 0), usd(1, 0), usd(50, 0)),
    anthropic("opus-5-5", Standard, usd(4, 0), usd(0, 200_000), usd(20, 0)),
    anthropic("opus-5", Standard, usd(5, 0), usd(0, 500_000), usd(25, 0)),
    anthropic("opus-4-8", Standard, usd(5, 0), usd(0, 500_000), usd(25, 0)),
    anthropic("opus-4-7", Standard, usd(5, 0), usd(0, 500_000), usd(25, 0)),
    anthropic("opus-4-6", Standard, usd(5, 0), usd(0, 500_000), usd(25, 0)),
    anthropic(
        "sonnet-5-5",
        Standard,
        usd(2, 0),
        usd(0, 100_000),
        usd(10, 0),
    ),
    anthropic("sonnet-5", Standard, usd(2, 0), usd(0, 200_000), usd(10, 0)),
    anthropic(
        "sonnet-4-6",
        Standard,
        usd(3, 0),
        usd(0, 300_000),
        usd(15, 0),
    ),
    anthropic("haiku-4-5", Standard, usd(1, 0), usd(0, 100_000), usd(5, 0)),
    anthropic("fable-5-2", Fast, usd(16, 0), usd(0, 400_000), usd(80, 0)),
    anthropic("opus-5-5", Fast, usd(8, 0), usd(0, 400_000), usd(40, 0)),
    anthropic("opus-5", Fast, usd(10, 0), usd(1, 0), usd(50, 0)),
    anthropic("opus-4-8", Fast, usd(10, 0), usd(1, 0), usd(50, 0)),
    openai(
        "gpt-6-1-sol",
        Standard,
        usd(2, 0),
        usd(0, 100_000),
        usd(10, 0),
    ),
    openai(
        "gpt-6-1-terra",
        Standard,
        usd(1, 0),
        usd(0, 50_000),
        usd(5, 0),
    ),
    openai(
        "gpt-6-sol",
        Standard,
        usd(2, 0),
        usd(0, 200_000),
        usd(10, 0),
    ),
    openai("gpt-6-astra", Standard, usd(10, 0), usd(1, 0), usd(50, 0)),
    openai(
        "gpt-6-luna",
        Standard,
        usd(0, 100_000),
        usd(0, 10_000),
        usd(0, 500_000),
    ),
    openai(
        "gpt-5-6-sol",
        Standard,
        usd(4, 0),
        usd(0, 400_000),
        usd(20, 0),
    ),
    openai(
        "gpt-5-6-terra",
        Standard,
        usd(2, 0),
        usd(0, 200_000),
        usd(12, 0),
    ),
    openai(
        "gpt-5-6-luna",
        Standard,
        usd(0, 200_000),
        usd(0, 20_000),
        usd(1, 200_000),
    ),
    openai("gpt-6-1-sol", Fast, usd(4, 0), usd(0, 200_000), usd(20, 0)),
    openai(
        "gpt-6-1-terra",
        Fast,
        usd(2, 0),
        usd(0, 100_000),
        usd(10, 0),
    ),
    openai("gpt-6-sol", Fast, usd(4, 0), usd(0, 400_000), usd(20, 0)),
    openai("gpt-6-astra", Fast, usd(20, 0), usd(2, 0), usd(100, 0)),
    openai(
        "gpt-6-luna",
        Fast,
        usd(0, 200_000),
        usd(0, 20_000),
        usd(1, 0),
    ),
    openai("gpt-5-6-sol", Fast, usd(8, 0), usd(0, 800_000), usd(40, 0)),
    openai(
        "gpt-5-6-terra",
        Fast,
        usd(4, 0),
        usd(0, 400_000),
        usd(24, 0),
    ),
    openai(
        "gpt-5-6-luna",
        Fast,
        usd(0, 400_000),
        usd(0, 40_000),
        usd(2, 400_000),
    ),
    openai("gpt-6-1-sol", Flex, usd(1, 0), usd(0, 50_000), usd(5, 0)),
    openai(
        "gpt-6-1-terra",
        Flex,
        usd(0, 500_000),
        usd(0, 25_000),
        usd(2, 500_000),
    ),
    openai("gpt-6-sol", Flex, usd(1, 0), usd(0, 100_000), usd(5, 0)),
    openai("gpt-6-astra", Flex, usd(5, 0), usd(0, 500_000), usd(25, 0)),
    openai(
        "gpt-6-luna",
        Flex,
        usd(0, 50_000),
        usd(0, 5_000),
        usd(0, 250_000),
    ),
    openai("gpt-5-6-sol", Flex, usd(2, 0), usd(0, 200_000), usd(10, 0)),
    openai("gpt-5-6-terra", Flex, usd(1, 0), usd(0, 100_000), usd(6, 0)),
    openai(
        "gpt-5-6-luna",
        Flex,
        usd(0, 100_000),
        usd(0, 10_000),
        usd(0, 600_000),
    ),
];
