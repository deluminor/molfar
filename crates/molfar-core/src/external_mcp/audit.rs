use super::{
    constants::{AUDIT_KEY, MAX_AUDIT_ENTRIES},
    types::AuditEntry,
};
use crate::store::Store;

impl Store {
    /// Metadata only: callers pass identifiers and outcomes, never credentials,
    /// prompts or transcript text.
    pub fn external_audit(&self, entry: AuditEntry) -> Result<(), String> {
        let mut entries = self.external_audit_log()?;
        entries.push(entry);
        let overflow = entries.len().saturating_sub(MAX_AUDIT_ENTRIES);
        entries.drain(..overflow);
        let raw = serde_json::to_string(&entries).map_err(|error| error.to_string())?;
        self.save_setting(AUDIT_KEY, &raw)
    }

    pub fn external_audit_log(&self) -> Result<Vec<AuditEntry>, String> {
        self.setting(AUDIT_KEY)?
            .map(|raw| serde_json::from_str(&raw).map_err(|error| error.to_string()))
            .transpose()
            .map(Option::unwrap_or_default)
    }
}

#[cfg(test)]
mod tests {
    use super::super::types::AuditEntry;
    use crate::store::Store;

    #[test]
    fn audit_keeps_the_latest_bounded_entries() {
        let store = Store::open(std::path::Path::new(":memory:")).unwrap();

        for index in 0..205 {
            store
                .external_audit(AuditEntry {
                    at: index,
                    client_id: "client".into(),
                    action: "board_read".into(),
                    target: None,
                    request_id: None,
                    outcome: "ok".into(),
                    kind: Default::default(),
                })
                .unwrap();
        }

        let log = store.external_audit_log().unwrap();
        assert_eq!(log.len(), 200);
        assert_eq!(log[0].at, 5);
    }
}

#[cfg(test)]
#[test]
fn audit_kind_and_metadata_only() {
    use super::{
        grants::types::{Requirement, ACCESS, DOMAIN, GRANT},
        types::Principal,
    };
    use serde_json::json;

    let raw = json!({"at":0,"clientId":"c","action":"test","target":null,"requestId":"r","outcome":"denied"});
    let mut entry: AuditEntry = serde_json::from_value(raw).unwrap();
    assert_eq!(entry.kind, ACCESS::Standard);
    let mut principal = Principal {
        client_id: "c".into(),
        name: "Client".into(),
        projects: vec![],
        grants: vec![GRANT::Write(DOMAIN::Board)],
        resources: vec![],
    };
    for (kind, flag, serialized) in [
        (ACCESS::Destructive, GRANT::Destructive, "destructive"),
        (ACCESS::Delegated, GRANT::Delegated, "delegated"),
    ] {
        let requirement = Requirement {
            any: &[GRANT::Write(DOMAIN::Board)],
            access: kind,
        };
        assert!(!principal.allows(&requirement));
        principal.grants.push(flag);
        assert!(principal.allows(&requirement));
        principal.grants.pop();
        entry.kind = kind;
        let value = serde_json::to_value(&entry).unwrap();
        assert_eq!(value["kind"], serialized);
        assert_eq!(value.as_object().unwrap().len(), 7);
    }
}
