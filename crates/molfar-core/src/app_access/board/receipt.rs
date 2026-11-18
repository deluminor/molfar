use super::normalize_request_id;
use crate::{
    external_mcp::receipts::{digest, BEGIN},
    store::Store,
};
use serde_json::Value;

/// Updates and archives cannot derive their outcome from the request ID the
/// way create derives its card ID, so the reservation is saved before the
/// Store write: a retry replays the saved result or rejects changed input.
pub(super) fn reserved(
    store: &mut Store,
    principal: &str,
    project: &str,
    action: &str,
    envelope: &str,
    input: &Value,
    write: impl FnOnce(&mut Store) -> Result<Value, String>,
) -> Result<Value, String> {
    let request = normalize_request_id(input["requestId"].as_str(), Some(envelope))?;
    let digest = digest(action, input);
    match store.external_receipt_begin(principal, project, action, &request, &digest)? {
        BEGIN::Replay(result) => return result,
        BEGIN::Conflict => return Err("Request ID was already used with different input".into()),
        BEGIN::Fresh | BEGIN::Pending => {}
    }

    let result = write(store);
    store.external_receipt_finish(principal, project, action, &request, &digest, &result)?;
    result
}
