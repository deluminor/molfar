use super::*;
use crate::secrets::{scopes_for, Redactor};

impl SecretStore {
    pub fn redactor(&self, db: &Store, project: Option<Scope>) -> Result<Redactor, Error> {
        self.load_redactor(db, project, false)
    }

    pub fn redactor_for_spawn(
        &self,
        db: &Store,
        project: Option<Scope>,
    ) -> Result<Redactor, Error> {
        self.load_redactor(db, project, true)
    }

    fn load_redactor(
        &self,
        db: &Store,
        project: Option<Scope>,
        allow_unavailable: bool,
    ) -> Result<Redactor, Error> {
        let _lock = lock()?;
        let index: Vec<Entry> = load(db, INDEX)?;
        let database = db.database_path().to_owned();
        let mut registry = self.registry.write().map_err(|_| Error::Index)?;
        let entries = registry.entry(database.clone()).or_default();
        let scopes: Vec<_> = scopes_for(project).collect();
        for entry in index {
            if scopes.contains(&entry.scope) && !entries.contains_key(&entry.id) {
                match self.backend.get(&entry.account()) {
                    Ok(value) => Registered::add(entries, entry, value),
                    Err(Error::Missing) => continue,
                    Err(Error::Unavailable) if allow_unavailable => continue,
                    Err(error) => return Err(error),
                }
            }
        }
        Ok(Redactor {
            registry: self.registry.clone(),
            database,
            scopes,
            extra: Vec::new(),
            ephemeral: Default::default(),
        })
    }

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

    pub(in crate::secrets) fn value_for_spawn(
        &self,
        database: &Path,
        entry: &Entry,
    ) -> Result<SecretValue, Error> {
        let _lock = lock()?;
        let value = self.backend.get(&entry.account())?;
        let mut registry = self.registry.write().map_err(|_| Error::Index)?;
        Registered::add(
            registry.entry(database.to_owned()).or_default(),
            entry.clone(),
            value.clone(),
        );
        Ok(value)
    }
}
