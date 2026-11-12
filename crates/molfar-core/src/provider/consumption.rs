use crate::consumption::UsageSnapshot;
use serde_json::Value;

pub(super) fn claude_result(value: &Value) -> Result<Option<UsageSnapshot>, String> {
    if !value["parent_tool_use_id"].is_null() {
        return Ok(None);
    }
    let Some(identity) = value["uuid"].as_str().filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };
    let Some(usage) = value["usage"].as_object() else {
        return Ok(None);
    };
    let count = |field: &str| -> Result<Option<u64>, String> {
        usage
            .get(field)
            .map(|value| {
                value.as_u64().ok_or_else(|| {
                    format!("Invalid Claude consumption source={identity} field={field}")
                })
            })
            .transpose()
    };
    let models = value["modelUsage"].as_object();
    let snapshot = UsageSnapshot {
        source_key: identity.into(),
        provider: "claude".into(),
        model: models
            .filter(|models| models.len() == 1)
            .and_then(|models| models.keys().next())
            .cloned(),
        reported_at_ms: Some(crate::time::now_ms()),
        input: count("input_tokens")?,
        output: count("output_tokens")?,
        cache_read: count("cache_read_input_tokens")?,
        cache_write: count("cache_creation_input_tokens")?,
    };
    snapshot.validate()?;
    Ok(Some(snapshot))
}
