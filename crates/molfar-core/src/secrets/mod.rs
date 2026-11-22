use std::path::Path;

use crate::store::Store;

mod backend;
pub mod bind;
pub mod ephemeral;
mod projects;
pub mod redact;
mod registry;
pub mod request;
pub mod run;
mod store;
mod token_match;
mod types;

pub use projects::Project;
pub use registry::Redactor;
pub use store::SecretStore;
pub use types::{Entry, Error, Scope, SecretName, SecretValue, Status};

pub fn scopes_for(scope: Option<Scope>) -> impl Iterator<Item = Scope> {
    scope
        .filter(|scope| *scope != Scope::Global)
        .into_iter()
        .chain(std::iter::once(Scope::Global))
}

#[cfg(any(test, not(feature = "test-secrets")))]
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
