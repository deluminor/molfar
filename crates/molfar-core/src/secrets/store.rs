use std::sync::{Arc, Mutex, MutexGuard};

use super::{
    backend::{Backend, KeyringBackend},
    load, projects, save, Entry, Error, Path, Project, Scope, SecretName, SecretValue, Status,
    Store, INDEX, PROJECTS,
};

#[derive(Clone)]
pub struct SecretStore {
    backend: Arc<dyn Backend>,
}

static INDEX_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn lock() -> Result<MutexGuard<'static, ()>, Error> {
    INDEX_LOCK.lock().map_err(|_| Error::Index)
}

impl Default for SecretStore {
    fn default() -> Self {
        Self::new(KeyringBackend)
    }
}

impl SecretStore {
    pub(super) fn new(backend: impl Backend + 'static) -> Self {
        Self {
            backend: Arc::new(backend),
        }
    }

    pub fn probe(&self) -> Result<(), Error> {
        self.backend.probe()
    }

    pub fn list(&self, db: &Store) -> Result<Vec<Entry>, Error> {
        let _lock = lock()?;
        load(db, INDEX)
    }

    pub fn projects(&self, db: &Store) -> Result<Vec<Project>, Error> {
        let _lock = lock()?;
        let map: projects::Projects = load(db, PROJECTS)?;
        Ok(map.into_values().collect())
    }

    pub fn project_scope(
        &self,
        db: &Store,
        path: &Path,
        label: Option<&str>,
    ) -> Result<Scope, Error> {
        let _lock = lock()?;
        projects::scope(db, path, label)
    }

    pub fn create(
        &self,
        db: &Store,
        scope: Scope,
        name: SecretName,
        value: SecretValue,
    ) -> Result<Status, Error> {
        let _lock = lock()?;
        let mut index: Vec<Entry> = load(db, INDEX)?;
        if index
            .iter()
            .any(|entry| entry.name == name && entry.scope == scope)
        {
            return Ok(Status::Exists);
        }

        let now = chrono::Utc::now().timestamp();
        let entry = Entry {
            id: uuid::Uuid::new_v4().to_string(),
            scope,
            name,
            created_at: now,
            updated_at: now,
            delete_failed: false,
        };
        let account = entry.account();
        self.backend.set(&account, &value)?;
        index.push(entry);
        if let Err(error) = save(db, INDEX, &index) {
            self.backend.delete(&account).map_err(|_| Error::Rollback)?;
            return Err(error);
        }
        Ok(Status::Saved)
    }

    pub fn replace(&self, db: &Store, id: &str, value: SecretValue) -> Result<(), Error> {
        let _lock = lock()?;
        let mut index: Vec<Entry> = load(db, INDEX)?;
        let entry = index
            .iter_mut()
            .find(|entry| entry.id == id)
            .ok_or(Error::Missing)?;
        let account = entry.account();
        let previous = self.backend.get(&account)?;
        self.backend.set(&account, &value)?;
        entry.updated_at = chrono::Utc::now().timestamp();
        if let Err(error) = save(db, INDEX, &index) {
            self.backend
                .set(&account, &previous)
                .map_err(|_| Error::Rollback)?;
            return Err(error);
        }
        Ok(())
    }

    pub fn rename(&self, db: &Store, id: &str, name: SecretName) -> Result<(), Error> {
        let _lock = lock()?;
        let mut index: Vec<Entry> = load(db, INDEX)?;
        let position = index
            .iter()
            .position(|entry| entry.id == id)
            .ok_or(Error::Missing)?;
        if index.iter().any(|entry| {
            entry.id != id && entry.name == name && entry.scope == index[position].scope
        }) {
            return Err(Error::Exists);
        }

        index[position].name = name;
        index[position].updated_at = chrono::Utc::now().timestamp();
        save(db, INDEX, &index)
    }

    pub fn delete(&self, db: &Store, id: &str) -> Result<(), Error> {
        self.delete_matching(db, |entry| entry.id == id)
    }

    pub fn delete_scope(&self, db: &Store, scope: &Scope) -> Result<(), Error> {
        self.delete_matching(db, |entry| &entry.scope == scope)
    }

    fn delete_matching(&self, db: &Store, matches: impl Fn(&Entry) -> bool) -> Result<(), Error> {
        let _lock = lock()?;
        let mut index: Vec<Entry> = load(db, INDEX)?;
        let mut failed = None;
        index.retain_mut(|entry| {
            if !matches(entry) {
                return true;
            }
            if let Err(error) = self.backend.delete(&entry.account()) {
                entry.delete_failed = true;
                failed = Some(error);
                return true;
            }
            false
        });
        save(db, INDEX, &index)?;
        failed.map_or(Ok(()), Err)
    }
}
