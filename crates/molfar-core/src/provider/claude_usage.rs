use crate::consumption::{TokenCounts, UsageSlice};
use serde_json::Value;

/// Per-model usage and speed from a parent Claude `result` frame. Subagent results are
/// already part of their parent's `modelUsage`.
pub(super) fn report(frame: &Value) -> Option<(Vec<UsageSlice>, Option<String>)> {
    if !frame["parent_tool_use_id"].is_null() {
        return None;
    }
    let models = frame["modelUsage"].as_object()?;
    let count = |entry: &Value, key: &str| entry[key].as_u64().unwrap_or(0);
    let slices: Vec<UsageSlice> = models
        .iter()
        .map(|(name, entry)| UsageSlice {
            model: entry["canonicalModel"]
                .as_str()
                .filter(|model| !model.is_empty())
                .unwrap_or(name)
                .to_owned(),
            tokens: TokenCounts {
                input: count(entry, "inputTokens"),
                output: count(entry, "outputTokens"),
                cache_read: count(entry, "cacheReadInputTokens"),
                cache_write: count(entry, "cacheCreationInputTokens"),
                cache_write_1h: entry["cacheCreationEphemeral1hInputTokens"].as_u64(),
            },
        })
        .collect();
    let speed = frame["usage"]["speed"].as_str().map(str::to_owned);

    (!slices.is_empty()).then_some((slices, speed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn result_frames_split_usage_per_model_with_cache_lifetimes_and_speed() {
        let frame = json!({
            "type": "result",
            "parent_tool_use_id": null,
            "usage": {"speed": "fast"},
            "modelUsage": {
                "claude-opus-5-5": {"inputTokens": 2, "outputTokens": 4,
                    "cacheReadInputTokens": 11040, "cacheCreationInputTokens": 25935,
                    "cacheCreationEphemeral1hInputTokens": 25935,
                    "canonicalModel": "claude-opus-5-5"},
                "claude-haiku-4-5-20251001": {"inputTokens": 90, "outputTokens": 7}
            }
        });

        let (slices, speed) = report(&frame).unwrap();

        assert_eq!(speed.as_deref(), Some("fast"));
        let opus = slices
            .iter()
            .find(|slice| slice.model == "claude-opus-5-5")
            .unwrap();
        assert_eq!(opus.tokens.cache_write, 25_935);
        assert_eq!(opus.tokens.cache_write_1h, Some(25_935));
        let haiku = slices
            .iter()
            .find(|slice| slice.model == "claude-haiku-4-5-20251001")
            .unwrap();
        assert_eq!(haiku.tokens.input, 90);
        assert_eq!(haiku.tokens.cache_write_1h, None);
    }

    #[test]
    fn child_frames_and_frames_without_model_usage_report_nothing() {
        assert!(report(&json!({"parent_tool_use_id": "tool", "modelUsage": {"m": {}}})).is_none());
        assert!(report(&json!({"usage": {"input_tokens": 1}})).is_none());
        assert!(report(&json!({"modelUsage": {}})).is_none());
    }
}
