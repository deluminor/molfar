use std::path::Path;

use crate::store::Store;

mod backend;
mod projects;
pub mod redact;
mod registry;
mod store;
mod types;

pub use projects::Project;
pub use registry::Redactor;
pub use store::SecretStore;
pub use types::{Entry, Error, Scope, SecretName, SecretValue, Status};

const SERVICE: &str = "com.molfar.secrets";
const INDEX: &str = "secrets.index";
const PROJECTS: &str = "secrets.projects";
const MIN_VALUE_BYTES: usize = 8;
const MAX_VALUE_BYTES: usize = 1024;

fn load<T: serde::de::DeserializeOwned + Default>(db: &Store, key: &str) -> Result<T, Error> {
    db.setting(key)
        .map_err(|_| Error::Index)?
        .map(|value| serde_json::from_str(&value).map_err(|_| Error::Index))
        .unwrap_or_else(|| Ok(T::default()))
}

fn save(db: &Store, key: &str, value: &impl serde::Serialize) -> Result<(), Error> {
    let json = serde_json::to_string(value).map_err(|_| Error::Index)?;
    db.save_setting(key, &json).map_err(|_| Error::Index)
}

#[cfg(test)]
mod tests;
