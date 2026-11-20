use molfar_core::{
    agent::Settings,
    secrets::{Error, Scope, SecretStore, bind::SpawnBindings},
};
use std::path::Path;

use super::{Database, locked};

pub(crate) fn attach(
    database: &Database,
    store: &SecretStore,
    project: &str,
    settings: &mut Settings,
    raw_native_command: bool,
) -> Result<(), String> {
    settings.secret_bindings = SpawnBindings::default();
    if project.starts_with("remote://")
        || settings.text_only
        || raw_native_command
        || settings.familiar.is_some()
        || settings.internal_message
        || settings.orchestrator
        || settings.orchestration_worker
    {
        return Ok(());
    }

    let db = locked(database)?;
    let project = match store.project_scope(&db, Path::new(project), None) {
        Ok(Scope::Project(project)) => project,
        Err(Error::Missing) => return Ok(()),
        Ok(_) => return Err("Invalid project secret scope.".into()),
        Err(error) => return Err(error.to_string()),
    };
    settings.secret_bindings =
        SpawnBindings::for_project(store, &db, &project).map_err(|error| error.to_string())?;
    Ok(())
}
