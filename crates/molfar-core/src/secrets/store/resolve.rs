use super::*;

impl SecretStore {
    pub(in crate::secrets) fn resolve_names(
        &self,
        db: &Store,
        scopes: &[Scope],
        names: &[SecretName],
    ) -> Result<Vec<SecretValue>, String> {
        let _lock = lock().map_err(|error| error.to_string())?;
        let index: Vec<Entry> = load(db, INDEX).map_err(|error| error.to_string())?;
        names
            .iter()
            .map(|name| {
                scopes
                    .iter()
                    .find_map(|scope| {
                        index.iter().find(|entry| {
                            !entry.delete_failed && &entry.scope == scope && &entry.name == name
                        })
                    })
                    .and_then(|entry| self.backend.get(&entry.account()).ok())
                    .ok_or_else(|| format!("Secret {} unavailable.", name.as_str()))
            })
            .collect()
    }

    pub(in crate::secrets) fn value_for_spawn(&self, entry: &Entry) -> Result<SecretValue, Error> {
        self.backend.get(&entry.account())
    }
}
