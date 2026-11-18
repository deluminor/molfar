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
        let saved = self
            .setting(&key)?
            .map(|raw| serde_json::from_str::<Receipt>(&raw).map_err(|error| error.to_string()))
            .transpose()?;
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

    fn save_receipt(
        &self,
        key: &str,
        digest: &str,
        result: Option<&Result<Value, String>>,
    ) -> Result<(), String> {
        let receipt = Receipt {
            digest: digest.into(),
            done: result.is_some(),
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
mod tests {
    use super::{digest, ReceiptTarget, BEGIN};
    use crate::store::Store;
    use serde_json::json;

    #[test]
    fn receipts_reserve_replay_and_reject_changed_input() {
        let store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let first = digest(
            "board_create",
            &json!({"title":"A","requestId":"r","b":[1]}),
        );
        let same = digest(
            "board_create",
            &json!({"b":[1],"requestId":"x","title":"A"}),
        );
        let changed = digest("board_create", &json!({"title":"B"}));

        let begin = |digest: &str| {
            store
                .external_receipt_begin(
                    "client",
                    &ReceiptTarget::Project("/work/a".into()),
                    "board_create",
                    "r",
                    digest,
                )
                .unwrap()
        };

        assert_eq!(first, same);
        assert_eq!(begin(&first), BEGIN::Fresh);
        assert_eq!(begin(&first), BEGIN::Pending);
        assert_eq!(begin(&changed), BEGIN::Conflict);
        store
            .external_receipt_finish(
                "client",
                &ReceiptTarget::Project("/work/a".into()),
                "board_create",
                "r",
                &first,
                &Ok(json!({"id":1})),
            )
            .unwrap();
        assert_eq!(begin(&first), BEGIN::Replay(Ok(json!({"id":1}))));
        assert_eq!(
            store
                .external_receipt_begin(
                    "other",
                    &ReceiptTarget::Project("/work/a".into()),
                    "board_create",
                    "r",
                    &first
                )
                .unwrap(),
            BEGIN::Fresh
        );
    }

    #[test]
    fn the_same_request_id_in_another_project_is_a_separate_mutation() {
        let store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let a = digest("board_create", &json!({"project":"/work/a","title":"A"}));
        let b = digest("board_create", &json!({"project":"/work/b","title":"A"}));
        let begin = |project: &str, digest: &str| {
            store
                .external_receipt_begin(
                    "client",
                    &ReceiptTarget::Project(project.into()),
                    "board_create",
                    "r",
                    digest,
                )
                .unwrap()
        };

        assert_eq!(begin("/work/a", &a), BEGIN::Fresh);
        assert_eq!(begin("/work/b", &b), BEGIN::Fresh);
        assert_eq!(begin("/work/a", &b), BEGIN::Conflict);
    }
}

#[cfg(test)]
#[test]
fn resource_receipt_keys_are_isolated_from_projects_and_each_resource_kind() {
    let key = |target| key_for(&target, "client", "action", "request");
    let keys = [
        key(ReceiptTarget::Project("/id".into())),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Vault,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::InboxProvider,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Familiar,
            id: "/id".into(),
        }),
        key(ReceiptTarget::Resource {
            kind: RESOURCE::Familiar,
            id: "/other".into(),
        }),
    ];
    assert_eq!(
        keys.iter().collect::<std::collections::HashSet<_>>().len(),
        keys.len()
    );
}
