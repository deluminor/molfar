use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, RwLock},
};

use super::{Entry, Scope, SecretValue};

pub(super) type Registry = Arc<RwLock<HashMap<PathBuf, Entries>>>;
pub(super) type Entries = HashMap<String, Registered>;

pub(super) struct Registered {
    pub entry: Entry,
    pub values: Vec<SecretValue>,
}

impl Registered {
    pub fn add(entries: &mut Entries, entry: Entry, value: SecretValue) {
        entries
            .entry(entry.id.clone())
            .or_insert_with(|| Self {
                entry,
                values: Vec::new(),
            })
            .values
            .push(value);
    }
}

#[derive(Clone)]
pub struct Redactor {
    pub(super) registry: Registry,
    pub(super) database: PathBuf,
    pub(super) project: Option<Scope>,
}
