use super::{
    prices::{ModelPrice, Vendor, PRICES},
    types::{TokenCounts, UsageRecord},
};

const CLAUDE_HARNESS: &str = "claude";
const CODEX_HARNESS: &str = "codex";
const DATE_SUFFIX_LEN: usize = 8;

/// Estimated cost as `tokens × micro-USD per million tokens`; divide by 10^12 for USD.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct Cost(pub u128);

impl Cost {
    pub const SCALE: u128 = 1_000_000_000_000;

    pub fn checked_add(self, other: Self) -> Option<Self> {
        self.0.checked_add(other.0).map(Self)
    }

    pub fn usd(self) -> f64 {
        self.0 as f64 / Self::SCALE as f64
    }
}

/// Only first-party harness reports are priced: their counters follow the vendor's billing
/// semantics. Other harnesses bill through their own plans, so their cost stays unavailable.
fn vendor(harness: &str) -> Option<Vendor> {
    match harness {
        CLAUDE_HARNESS => Some(Vendor::Anthropic),
        CODEX_HARNESS => Some(Vendor::OpenAi),
        _ => None,
    }
}

/// `Opus 5.5`, `claude:claude-opus-5-5-20261001` and `opus-5-5` share one key.
pub fn model_key(model: &str) -> String {
    let model = model.rsplit(':').next().unwrap_or(model).to_lowercase();
    let model = model.split('[').next().unwrap_or(&model);
    let mut key = String::with_capacity(model.len());
    for character in model.chars() {
        if character.is_ascii_alphanumeric() {
            key.push(character);
        } else if !key.ends_with('-') && !key.is_empty() {
            key.push('-');
        }
    }
    let mut key = key.trim_end_matches('-').to_owned();
    if let Some(stripped) = key.strip_prefix("claude-") {
        key = stripped.to_owned();
    }
    if let Some((head, tail)) = key.rsplit_once('-') {
        if tail.len() == DATE_SUFFIX_LEN && tail.bytes().all(|byte| byte.is_ascii_digit()) {
            key = head.to_owned();
        }
    }

    key
}

pub fn price_for(record: &UsageRecord) -> Option<&'static ModelPrice> {
    let vendor = vendor(&record.provider)?;
    [record.model_id.as_deref(), record.model_name.as_deref()]
        .into_iter()
        .flatten()
        .map(model_key)
        .find_map(|key| {
            PRICES
                .iter()
                .find(|price| price.vendor == vendor && price.key == key)
        })
}

/// Counters in one shape for every harness: `input` excludes cached input. Codex reports
/// cached input inside `input`; Claude and the other harnesses already report it apart.
/// `None` when the harness reported nothing or inconsistent counters.
pub fn normalized(record: &UsageRecord) -> Option<TokenCounts> {
    let tokens = record.tokens?;
    if record.provider != CODEX_HARNESS {
        return Some(tokens);
    }

    Some(TokenCounts {
        input: tokens.input.checked_sub(tokens.cache_read)?,
        ..tokens
    })
}

/// `None` means unavailable: no report, unknown model, or a dimension the table cannot price.
pub fn cost(record: &UsageRecord) -> Option<Cost> {
    let tokens = normalized(record)?;
    let price = price_for(record)?;
    let cache_write = match (tokens.cache_write, price.cache_write) {
        (0, _) => 0,
        (tokens, Some(rate)) => u128::from(tokens) * u128::from(rate),
        (_, None) => return None,
    };

    let total = u128::from(tokens.input) * u128::from(price.input)
        + u128::from(tokens.output) * u128::from(price.output)
        + u128::from(tokens.cache_read) * u128::from(price.cache_read)
        + cache_write;
    Some(Cost(total))
}
