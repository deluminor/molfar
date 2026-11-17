#[cfg(test)]
mod tests;

/// Normalize once before receipt lookup; a supplied invalid ID cannot fall back
/// to another source, which would silently change retry identity.
pub fn normalize_request_id(
    argument: Option<&str>,
    envelope: Option<&str>,
) -> Result<String, String> {
    let validate = |value: &str| -> Result<String, String> {
        let id = value.trim();
        if id.is_empty() || id.len() > 128 || id.chars().any(char::is_control) {
            return Err("Invalid Board request ID.".into());
        }

        Ok(id.to_owned())
    };
    let argument = argument.map(validate).transpose()?;
    let envelope = envelope.map(validate).transpose()?;
    if let (Some(argument), Some(envelope)) = (&argument, &envelope) {
        if argument != envelope {
            return Err("Conflicting Board request IDs.".into());
        }
    }

    argument
        .or(envelope)
        .ok_or_else(|| "Board request ID is required.".into())
}
