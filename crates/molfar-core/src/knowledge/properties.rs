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

    let properties = map
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
    (properties, rest)
}
