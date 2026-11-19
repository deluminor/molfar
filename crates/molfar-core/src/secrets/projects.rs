use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{load, save, Error, Path, Scope, Store, PROJECTS};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub last_path: String,
    pub last_label: String,
}

impl Project {
    pub fn scope(&self) -> Scope {
        Scope::Project(self.id.clone())
    }

    pub fn is_missing(&self) -> bool {
        !Path::new(&self.last_path).is_dir()
    }
}

pub(super) type Projects = BTreeMap<String, Project>;

pub(super) fn scope(db: &Store, path: &Path, label: Option<&str>) -> Result<Scope, Error> {
    let key = project_root(path).to_string_lossy().into_owned();
    let mut projects: Projects = load(db, PROJECTS)?;
    if let Some(project) = projects.get(&key) {
        if label.is_none_or(|label| label == project.last_label) {
            return Ok(project.scope());
        }
    } else if label.is_none() {
        return Err(Error::Missing);
    }

    let label = label.ok_or(Error::Missing)?;
    let project = projects.entry(key.clone()).or_insert_with(|| Project {
        id: uuid::Uuid::new_v4().to_string(),
        last_path: key,
        last_label: label.to_owned(),
    });
    project.last_label = label.to_owned();
    let scope = project.scope();
    save(db, PROJECTS, &projects)?;
    Ok(scope)
}

fn project_root(path: &Path) -> std::path::PathBuf {
    let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if !path.join(".git").is_file() {
        return path;
    }

    crate::git::worktrees(&path)
        .ok()
        .and_then(|trees| trees.into_iter().find(|tree| tree.main))
        .and_then(|main| Path::new(&main.path).canonicalize().ok())
        .unwrap_or(path)
}
