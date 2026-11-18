use super::{constants::RECEIPT_PREFIX, grants::types::RESOURCE};
use crate::store::Store;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum ReceiptTarget {
    Project(String),
    Resource { kind: RESOURCE, id: String },
}

#[derive(Debug, PartialEq)]
pub enum BEGIN {
    /// Reserved now; dispatch may proceed.
    Fresh,
    /// Reserved earlier and never finished: the outcome is unknown.
    Pending,
    Replay(Result<Value, String>),
    Conflict,
}

#[derive(Deserialize, Serialize)]
struct Receipt {
    digest: String,
    done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    binding: Option<String>,
    result: Option<Result<Value, String>>,
}

impl Store {
    /// Persists the reservation before any side effect, so a crash leaves a
    /// visible pending receipt instead of permission to dispatch again.
    /// The caller must authorize the target before looking up the receipt.
    pub fn external_receipt_begin(
        &self,
        client: &str,
        target: &ReceiptTarget,
        action: &str,
        request: &str,
        digest: &str,
    ) -> Result<BEGIN, String> {
        let key = key_for(target, client, action, request);
        let saved = self.external_receipt(&key)?;
        let Some(saved) = saved else {
            self.save_receipt(&key, digest, None)?;
            return Ok(BEGIN::Fresh);
        };

        Ok(match (saved.digest == digest, saved.done, saved.result) {
            (false, _, _) => BEGIN::Conflict,
            (true, true, Some(result)) => BEGIN::Replay(result),
            _ => BEGIN::Pending,
        })
    }

    pub fn external_receipt_finish(
        &self,
        client: &str,
        target: &ReceiptTarget,
        action: &str,
        request: &str,
        digest: &str,
        result: &Result<Value, String>,
    ) -> Result<(), String> {
        self.save_receipt(
            &key_for(target, client, action, request),
            digest,
            Some(result),
        )
    }

    fn external_receipt(&self, key: &str) -> Result<Option<Receipt>, String> {
        self.setting(key)?
            .map(|raw| serde_json::from_str(&raw).map_err(|error| error.to_string()))
            .transpose()
    }

    pub fn external_receipt_find(
        &self,
        client: &str,
        action: &str,
        request: &str,
        projects: &[String],
        digest: &str,
    ) -> Result<Option<BEGIN>, String> {
        let mut conflict = false;
        for project in projects {
            if let Some(saved) = self.external_receipt(&key_for(
                &ReceiptTarget::Project(project.clone()),
                client,
                action,
                request,
            ))? {
                if saved.digest == digest {
                    return Ok(Some(match (saved.done, saved.result) {
                        (true, Some(result)) => BEGIN::Replay(result),
                        _ => BEGIN::Pending,
                    }));
                }
                conflict = true;
            }
        }
        Ok(conflict.then_some(BEGIN::Conflict))
    }

    pub fn external_receipt_exists(
        &self,
        target: &ReceiptTarget,
        client: &str,
        action: &str,
        request: &str,
    ) -> Result<bool, String> {
        self.setting(&key_for(target, client, action, request))
            .map(|receipt| receipt.is_some())
    }

    pub fn external_receipt_bind(
        &self,
        target: &ReceiptTarget,
        client: &str,
        action: &str,
        request: &str,
        binding: String,
    ) -> Result<bool, String> {
        let key = key_for(target, client, action, request);
        let raw = self
            .setting(&key)?
            .ok_or("Request receipt is unavailable.")?;
        let mut receipt: Receipt = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
        if let Some(previous) = receipt.binding {
            return Ok(previous == binding);
        }
        receipt.binding = Some(binding);
        let raw = serde_json::to_string(&receipt).map_err(|error| error.to_string())?;
        self.save_setting(&key, &raw)?;
        Ok(true)
    }

    fn save_receipt(
        &self,
        key: &str,
        digest: &str,
        result: Option<&Result<Value, String>>,
    ) -> Result<(), String> {
        let receipt = Receipt {
            digest: digest.into(),
            done: result.is_some(),
            binding: None,
            result: result.cloned(),
        };
        let raw = serde_json::to_string(&receipt).map_err(|error| error.to_string())?;
        self.save_setting(key, &raw)
    }
}

/// Digest of the arguments without `requestId`, independent of key order.
pub fn digest(action: &str, arguments: &Value) -> String {
    let mut arguments = arguments.clone();
    if let Some(object) = arguments.as_object_mut() {
        object.remove("requestId");
    }
    crate::familiar::files::content_hash(&format!("{action}\n{}", canonical(&arguments)))
}

fn canonical(value: &Value) -> String {
    match value {
        Value::Object(object) => {
            let mut keys: Vec<_> = object.keys().collect();
            keys.sort();
            let fields: Vec<String> = keys
                .into_iter()
                .map(|key| format!("{}:{}", Value::String(key.clone()), canonical(&object[key])))
                .collect();
            format!("{{{}}}", fields.join(","))
        }
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        other => other.to_string(),
    }
}

pub fn key_for(target: &ReceiptTarget, client: &str, action: &str, request: &str) -> String {
    let identity = match target {
        ReceiptTarget::Project(project) => {
            let project = crate::files::path_key(project);
            format!("{project}\n{action}\n{request}")
        }
        ReceiptTarget::Resource { kind, id } => {
            serde_json::json!([kind, id, action, request]).to_string()
        }
    };
    let namespace = match target {
        ReceiptTarget::Project(_) => RECEIPT_PREFIX,
        ReceiptTarget::Resource { .. } => "external-mcp:resource-receipt",
    };
    format!(
        "{namespace}:{client}:{}",
        crate::familiar::files::content_hash(&identity)
    )
}

#[cfg(test)]
mod tests;
