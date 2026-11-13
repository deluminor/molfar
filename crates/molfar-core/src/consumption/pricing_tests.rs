use super::{
    prices::{PRICES, PRICE_TABLE_VERSION},
    pricing::{cost, model_key, normalized, Cost},
    TokenCounts, UsageRecord,
};

const MILLION: u64 = 1_000_000;

fn record(provider: &str, model_id: &str, name: &str, tokens: TokenCounts) -> UsageRecord {
    UsageRecord {
        source_key: "receipt".into(),
        provider: provider.into(),
        model_id: Some(model_id.into()),
        model_name: Some(name.into()),
        started_at_ms: None,
        reported_at_ms: None,
        tokens: Some(tokens),
    }
}

fn usd(cost: Option<Cost>) -> Option<f64> {
    cost.map(Cost::usd)
}

#[test]
fn model_keys_unify_aliases_display_names_and_dated_ids() {
    assert_eq!(model_key("Opus 5.5"), "opus-5-5");
    assert_eq!(model_key("claude:claude-opus-5-5-20261001"), "opus-5-5");
    assert_eq!(model_key("claude-haiku-4-5-20251001"), "haiku-4-5");
    assert_eq!(model_key("opus[1m]"), "opus");
    assert_eq!(model_key("codex:gpt-6.1-sol"), "gpt-6-1-sol");
    assert_eq!(model_key("GPT-6.1-Sol"), "gpt-6-1-sol");
}

#[test]
fn claude_prices_every_category_once_and_resolves_aliases_by_display_name() {
    let tokens = TokenCounts {
        input: MILLION,
        output: MILLION,
        cache_read: MILLION,
        cache_write: MILLION,
    };

    let estimate = usd(cost(&record("claude", "opus", "Opus 5.5", tokens)));

    assert_eq!(estimate, Some(29.2));
}

#[test]
fn codex_cached_input_is_carved_out_of_input_and_never_charged_twice() {
    let tokens = TokenCounts {
        input: 1_200_000,
        output: 80_000,
        cache_read: MILLION,
        cache_write: 0,
    };
    let codex = record("codex", "codex:gpt-6.1-sol", "GPT-6.1-Sol", tokens);

    assert_eq!(normalized(&codex).unwrap().input, 200_000);
    assert_eq!(usd(cost(&codex)), Some(1.3));
}

#[test]
fn unknown_models_unsupported_dimensions_and_other_harnesses_stay_unavailable() {
    let tokens = TokenCounts {
        input: 10,
        output: 10,
        ..Default::default()
    };
    assert_eq!(cost(&record("claude", "opus", "Opus", tokens)), None);
    assert_eq!(cost(&record("claude", "haiku", "Haiku 5.5", tokens)), None);
    assert_eq!(
        cost(&record("cursor", "claude:opus", "Opus 5.5", tokens)),
        None
    );
    assert_eq!(
        cost(&record("codex", "qwen3.6:latest", "qwen", tokens)),
        None
    );

    let write = TokenCounts {
        cache_write: 5,
        ..tokens
    };
    assert_eq!(
        cost(&record("codex", "gpt-6-luna", "GPT-6-Luna", write)),
        None
    );

    let inconsistent = TokenCounts {
        cache_read: 11,
        ..tokens
    };
    let codex = record("codex", "gpt-6-luna", "GPT-6-Luna", inconsistent);
    assert_eq!(normalized(&codex), None);
    assert_eq!(cost(&codex), None);
}

#[test]
fn unreported_runs_have_no_cost_not_zero() {
    let mut unreported = record("claude", "opus", "Opus 5.5", TokenCounts::default());
    unreported.tokens = None;

    assert_eq!(cost(&unreported), None);
}

#[test]
fn price_table_is_versioned_and_keys_are_unique_per_vendor() {
    assert_eq!(PRICE_TABLE_VERSION.len(), "2026-11-13".len());
    for (index, price) in PRICES.iter().enumerate() {
        assert_eq!(model_key(price.key), price.key);
        assert!(PRICES[index + 1..]
            .iter()
            .all(|other| other.key != price.key || other.vendor != price.vendor));
    }
}
