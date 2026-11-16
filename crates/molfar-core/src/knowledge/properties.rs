use super::parse::frontmatter;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteProperty {
    pub key: String,
    pub values: Vec<String>,
    /// Lists render as chips even with one value.
    pub list: bool,
}

fn scalar(value: &Value) -> String {
    match value {
        Value::String(text) => text.trim().to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Top-level frontmatter keys in authored order; the parsed map is sorted.
fn authored_keys(body: &str) -> Vec<String> {
    body.trim_start_matches('\u{feff}')
        .lines()
        .skip(1)
        .take_while(|line| !matches!(line.trim_end(), "---" | "..."))
        .filter(|line| !line.starts_with([' ', '\t', '-', '#']))
        .filter_map(|line| line.split_once(':'))
        .map(|(key, _)| key.trim().trim_matches(['"', '\'']).to_string())
        .collect()
}

/// Splits a note into its frontmatter properties and the Markdown after it.
/// Invalid or unclosed frontmatter keeps the whole body, so nothing is hidden.
pub fn note_properties(body: &str) -> (Vec<NoteProperty>, &str) {
    let (metadata, rest, error) = frontmatter(body);
    if error.is_some() {
        return (Vec::new(), body);
    }
    let Some(Value::Object(map)) = metadata else {
        return (Vec::new(), rest);
    };

    let order = authored_keys(body);
    let rank = |key: &str| {
        order
            .iter()
            .position(|known| known == key)
            .unwrap_or(usize::MAX)
    };
    let mut properties: Vec<NoteProperty> = map
        .iter()
        .map(|(key, value)| match value {
            Value::Array(items) => NoteProperty {
                key: key.clone(),
                values: items
                    .iter()
                    .map(scalar)
                    .filter(|item| !item.is_empty())
                    .collect(),
                list: true,
            },
            other => NoteProperty {
                key: key.clone(),
                values: Some(scalar(other))
                    .filter(|item| !item.is_empty())
                    .into_iter()
                    .collect(),
                list: false,
            },
        })
        .collect();
    properties.sort_by_key(|property| rank(&property.key));
    (properties, rest)
}
