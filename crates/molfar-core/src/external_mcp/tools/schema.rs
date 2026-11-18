use serde_json::{json, Value};

pub(super) fn string(description: &str) -> Value {
    json!({"type":"string","description":description})
}

pub(super) fn integer(description: &str) -> Value {
    json!({"type":"integer","minimum":0,"description":description})
}

pub(super) fn object(properties: Value, required: &[&str]) -> Value {
    json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})
}

pub(super) fn request_id() -> Value {
    json!({"type":"string","minLength":1,"maxLength":128,"description":"Stable ID; retry an uncertain call with the same ID and identical input"})
}
