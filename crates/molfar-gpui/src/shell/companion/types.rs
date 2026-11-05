use super::*;

pub(super) enum Target {
    Session(i64),
    Familiar(String),
}

pub(super) fn required(input: &Value, key: &str) -> Result<String, String> {
    match input.get(key).and_then(Value::as_str) {
        Some(value) if !value.is_empty() && value.len() <= 200 => Ok(value.to_string()),
        _ => Err(format!("{key} is required")),
    }
}

pub(super) fn session_id(input: &Value) -> Result<i64, String> {
    required(input, "sessionId")?
        .parse()
        .map_err(|_| "Session not found".into())
}

pub(super) fn message_text(input: &Value) -> Result<String, String> {
    let attached = |key| {
        input
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty())
    };
    if attached("images") || attached("files") {
        return Err("Photo and file attachments are not on MOLFAR Native yet".into());
    }
    let text = input
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if text.is_empty() {
        return Err("Write something or attach a photo or file".into());
    }
    if text.chars().count() > 100_000 {
        return Err("text must be under 100000 characters".into());
    }
    Ok(text.to_string())
}

pub(super) fn project_ref(path: &str) -> Value {
    let name = std::path::Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    json!({"path": path, "name": name})
}

pub(super) fn request_number(id: &str) -> u64 {
    let hash = id.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    });
    hash & ((1 << 53) - 1)
}

pub(super) fn sha256(value: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(super) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}
