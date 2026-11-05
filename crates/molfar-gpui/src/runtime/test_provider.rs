use super::{Database, locked};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

type Key = (PathBuf, i64);

fn registry() -> &'static Mutex<HashMap<Key, PathBuf>> {
    static REGISTRY: OnceLock<Mutex<HashMap<Key, PathBuf>>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}

pub(crate) struct Registration(Key);

impl Registration {
    pub(crate) fn new(store: &Database, session: i64, binary: PathBuf) -> Self {
        let key = (locked(store).unwrap().database_path().to_owned(), session);
        assert!(
            registry()
                .lock()
                .unwrap()
                .insert(key.clone(), binary)
                .is_none()
        );
        Self(key)
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        registry().lock().unwrap().remove(&self.0);
    }
}

pub(super) fn registered(store: &Database, session: i64) -> Option<PathBuf> {
    let key = (locked(store).unwrap().database_path().to_owned(), session);
    registry().lock().unwrap().get(&key).cloned()
}
