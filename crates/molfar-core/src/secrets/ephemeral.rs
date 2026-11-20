use secrecy::ExposeSecret;
use std::{
    fmt,
    path::Path,
    sync::{Arc, Mutex, RwLock, RwLockReadGuard},
};

use super::{Error, Scope, SecretName, SecretStore, SecretValue, Status, Store};
use crate::agent::Question;

type Values = Vec<(SecretName, SecretValue)>;

#[derive(Clone, Default)]
pub struct Ephemeral {
    values: Arc<RwLock<Values>>,
    save: Option<SaveTarget>,
}

#[derive(Clone)]
struct SaveTarget {
    database: Arc<Mutex<Store>>,
    store: SecretStore,
    project: String,
    familiar: Option<String>,
}

impl fmt::Debug for Ephemeral {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("Ephemeral").finish_non_exhaustive()
    }
}

impl Ephemeral {
    pub fn for_session(
        database: Arc<Mutex<Store>>,
        store: SecretStore,
        project: String,
        familiar: Option<String>,
    ) -> Self {
        Self {
            save: Some(SaveTarget {
                database,
                store,
                project,
                familiar,
            }),
            ..Self::default()
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.values().is_empty()
    }

    pub(super) fn values(&self) -> RwLockReadGuard<'_, Values> {
        self.values
            .read()
            .unwrap_or_else(|error| error.into_inner())
    }

    fn register(&self, name: SecretName, value: SecretValue) {
        self.values
            .write()
            .unwrap_or_else(|error| error.into_inner())
            .push((name, value));
    }

    fn save(&self, name: SecretName, value: &SecretValue) -> Result<Status, Error> {
        let target = self.save.as_ref().ok_or(Error::Unavailable)?;
        let db = target.database.lock().map_err(|_| Error::Index)?;
        let scope = match &target.familiar {
            Some(id) => Scope::Familiar(id.clone()),
            None => target.store.project_scope(
                &db,
                Path::new(&target.project),
                Some(&target.project),
            )?,
        };
        let value = SecretValue::parse(value.0.clone())?;
        target.store.create(&db, scope, name, value)
    }
}

#[derive(Clone, Default)]
pub struct SecretAnswers(Vec<SecretAnswer>);

#[derive(Clone)]
struct SecretAnswer {
    index: usize,
    value: SecretValue,
    save_as: Option<SecretName>,
}

impl fmt::Debug for SecretAnswers {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_list()
            .entries(self.0.iter().map(|answer| answer.index))
            .finish()
    }
}

impl SecretAnswers {
    pub fn push(&mut self, index: usize, value: SecretValue, save_as: Option<SecretName>) {
        self.0.push(SecretAnswer {
            index,
            value,
            save_as,
        });
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(crate) fn register(
        &self,
        question: &Question,
        ephemeral: &Ephemeral,
    ) -> Result<(), String> {
        let mut seen = std::collections::HashSet::new();
        for answer in &self.0 {
            if !seen.insert(answer.index)
                || !question
                    .items
                    .get(answer.index)
                    .is_some_and(|item| item.secret)
            {
                return Err("Invalid provider secret answer.".into());
            }
        }
        for answer in &self.0 {
            let name = provider_name(&question.items[answer.index].id);
            ephemeral.register(name, answer.value.clone());
        }
        Ok(())
    }

    pub(crate) fn value(&self, index: usize) -> Option<&str> {
        self.0
            .iter()
            .find(|answer| answer.index == index)
            .map(|answer| answer.value.0.expose_secret())
    }

    pub(crate) fn metadata(&self, question: &Question, ephemeral: &Ephemeral) -> Vec<String> {
        self.0
            .iter()
            .map(|answer| {
                let prompt = &question.items[answer.index].prompt;
                let save = answer
                    .save_as
                    .as_ref()
                    .map(|name| {
                        let outcome = match ephemeral.save(name.clone(), &answer.value) {
                            Ok(Status::Saved) => "saved".into(),
                            Ok(Status::Exists) => "exists, not saved".into(),
                            Ok(_) => "not saved".into(),
                            Err(error) => format!("not saved ({error})"),
                        };
                        format!(" · {} {outcome}", name.as_str())
                    })
                    .unwrap_or_default();
                format!("{prompt} — answered (secret){save}")
            })
            .collect()
    }
}

pub fn provider_name(id: &str) -> SecretName {
    let normalized: String = id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    let normalized = normalized.trim_matches('_');
    let name = if normalized.is_empty() {
        "PROVIDER_SECRET".to_owned()
    } else if normalized.starts_with(|ch: char| ch.is_ascii_digit()) {
        format!("_{}", &normalized[..normalized.len().min(63)])
    } else {
        normalized.to_owned()
    };
    SecretName::parse(name).expect("normalized secret name")
}

#[cfg(test)]
mod tests;
