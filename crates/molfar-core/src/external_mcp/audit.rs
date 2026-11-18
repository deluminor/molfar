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
                })
                .unwrap();
        }

        let log = store.external_audit_log().unwrap();
        assert_eq!(log.len(), 200);
        assert_eq!(log[0].at, 5);
    }
}
