use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fmt,
    process::Command,
};

use super::{load, save, scopes_for, Entry, Error, Scope, SecretName, SecretStore, Store};

const KEY: &str = "secrets.bindings";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretBinding {
    pub env: SecretName,
    pub secret_id: String,
}

#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectBindings {
    pub enabled: bool,
    pub items: Vec<SecretBinding>,
}

type Projects = BTreeMap<String, ProjectBindings>;

pub fn settings(db: &Store, project: &str) -> Result<ProjectBindings, Error> {
    Ok(load::<Projects>(db, KEY)?
        .remove(project)
        .unwrap_or_default())
}

pub fn configure(
    store: &SecretStore,
    db: &Store,
    project: &str,
    config: ProjectBindings,
) -> Result<(), String> {
    let mut seen = HashSet::new();
    let scopes: Vec<_> = scopes_for(Some(Scope::Project(project.to_owned()))).collect();
    let entries = store.list(db).map_err(|error| error.to_string())?;
    for item in &config.items {
        super::run::validate_env(&item.env)?;
        if !seen.insert(item.env.as_str()) {
            return Err("Duplicate environment variable.".into());
        }
        if !entries.iter().any(|entry| {
            entry.id == item.secret_id && !entry.delete_failed && scopes.contains(&entry.scope)
        }) {
            return Err("Choose a secret available to this project.".into());
        }
    }

    let mut projects: Projects = load(db, KEY).map_err(|error| error.to_string())?;
    projects.insert(project.to_owned(), config);
    save(db, KEY, &projects).map_err(|error| error.to_string())
}

pub(super) fn remove(db: &Store, project: Option<&str>, removed: &[String]) -> Result<(), Error> {
    let mut projects: Projects = load(db, KEY)?;
    let mut changed = project.is_some_and(|project| projects.remove(project).is_some());
    for config in projects.values_mut() {
        let count = config.items.len();
        config
            .items
            .retain(|item| !removed.contains(&item.secret_id));
        changed |= config.items.len() != count;
    }
    if changed {
        save(db, KEY, &projects)?;
    }
    Ok(())
}

#[derive(Clone, Default)]
pub struct SpawnBindings {
    store: Option<SecretStore>,
    items: Vec<(SecretBinding, Option<Entry>)>,
}

impl fmt::Debug for SpawnBindings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SpawnBindings")
            .field("items", &self.items)
            .finish()
    }
}

impl SpawnBindings {
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub(crate) fn key(&self) -> Vec<(&SecretName, &str, Option<i64>)> {
        self.items
            .iter()
            .map(|(binding, entry)| {
                (
                    &binding.env,
                    binding.secret_id.as_str(),
                    entry.as_ref().map(|entry| entry.updated_at),
                )
            })
            .collect()
    }

    pub fn for_project(store: &SecretStore, db: &Store, project: &str) -> Result<Self, Error> {
        let config = settings(db, project)?;
        if !config.enabled || config.items.is_empty() {
            return Ok(Self::default());
        }
        let entries = store.list(db)?;
        let scopes: Vec<_> = scopes_for(Some(Scope::Project(project.to_owned()))).collect();
        let mut seen = HashSet::new();
        let mut items = Vec::with_capacity(config.items.len());
        for item in config.items {
            if super::run::validate_env(&item.env).is_err()
                || !seen.insert(item.env.as_str().to_owned())
            {
                return Err(Error::InvalidName);
            }
            let entry = entries
                .iter()
                .find(|entry| {
                    entry.id == item.secret_id
                        && !entry.delete_failed
                        && scopes.contains(&entry.scope)
                })
                .cloned();
            items.push((item, entry));
        }
        Ok(Self {
            store: Some(store.clone()),
            items,
        })
    }
}

pub(crate) fn apply(command: &mut Command, bindings: &SpawnBindings) -> Vec<String> {
    let mut notices = Vec::new();
    let Some(store) = &bindings.store else {
        return notices;
    };
    for (item, entry) in &bindings.items {
        let env = item.env.as_str();
        match entry
            .as_ref()
            .and_then(|entry| store.value_for_spawn(entry).ok())
        {
            Some(value) if !value.0.expose_secret().contains('\0') => {
                command.env(env, value.0.expose_secret());
            }
            _ => {
                command.env_remove(env);
                let name = entry
                    .as_ref()
                    .map_or(item.secret_id.as_str(), |entry| entry.name.as_str());
                notices.push(format!("Secret {name} unavailable; {env} not set"));
            }
        }
    }
    notices
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::{backend::MemoryBackend, SecretValue};
    use std::path::Path;

    #[test]
    fn bind_apply_sets_child_env_without_serializing_value() {
        let db = Store::open(Path::new(":memory:")).unwrap();
        let store = SecretStore::new(MemoryBackend::default());
        let project = "project";
        let name = SecretName::parse("SECRET").unwrap();
        let value = "fixture-bind-value";
        store
            .create(
                &db,
                Scope::Project(project.into()),
                name.clone(),
                SecretValue::from_text(value.into()).unwrap(),
            )
            .unwrap();
        let secret_id = store.list(&db).unwrap().remove(0).id;
        let items = vec![SecretBinding {
            env: name,
            secret_id: secret_id.clone(),
        }];
        assert!(SpawnBindings::for_project(&store, &db, project)
            .unwrap()
            .is_empty());
        configure(
            &store,
            &db,
            project,
            ProjectBindings {
                enabled: true,
                items,
            },
        )
        .unwrap();

        let bindings = SpawnBindings::for_project(&store, &db, project).unwrap();
        let key = serde_json::to_string(&bindings.key()).unwrap();
        assert!(!key.contains(value));
        let mut command = Command::new("fixture");
        assert!(apply(&mut command, &bindings).is_empty());
        assert_eq!(command.get_envs().next().unwrap().1.unwrap(), value);
        let settings = crate::agent::Settings {
            secret_bindings: bindings.clone(),
            ..Default::default()
        };
        let serialized = serde_json::to_string(&settings).unwrap();
        assert!(!serialized.contains(value) && !serialized.contains(&secret_id));
        assert!(!db.setting(KEY).unwrap().unwrap().contains(value));

        store.delete(&db, &secret_id).unwrap();
        assert!(super::settings(&db, project).unwrap().items.is_empty());
        assert_eq!(
            apply(&mut command, &bindings),
            ["Secret SECRET unavailable; SECRET not set"]
        );
        assert!(command.get_envs().next().unwrap().1.is_none());
    }
}
