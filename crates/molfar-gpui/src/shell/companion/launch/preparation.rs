use super::*;

pub(super) fn validated_settings(
    input: &Value,
    kind: Kind,
    settings: Settings,
    models: &[Model],
) -> Result<Settings, String> {
    let mut launch = json!({"prompt":message_text(input)?});
    for key in ["model", "effort", "runtimeMode", "workspaceMode"] {
        if let Some(value) = input.get(key) {
            launch[key] = value.clone();
        }
    }
    let mut settings = app::launch_settings(&launch, kind.id(), settings, kind, models)?;
    settings.worktree_cwd = None;
    Ok(settings)
}

pub(super) fn prepare(
    store: &Database,
    project: &str,
    kind: Kind,
    input: &Value,
    settings: Settings,
    models: &[Model],
    check: impl Fn() -> Result<(), String>,
) -> Result<(Session, Settings), String> {
    let settings = validated_settings(input, kind, settings, models)?;
    check()?;
    let (summary, settings) = create(store, project, kind, input, settings)?;
    if let Err(error) = check() {
        rollback(
            store,
            &summary,
            &settings,
            input["workspaceMode"] == "worktree",
        )
        .map_err(|cleanup| format!("{error}; cleanup failed: {cleanup}"))?;
        return Err(error);
    }
    Ok((summary, settings))
}

fn create(
    store: &Database,
    project: &str,
    kind: Kind,
    input: &Value,
    mut settings: Settings,
) -> Result<(Session, Settings), String> {
    let summary = locked(store)?.create(kind.id(), project)?;
    let checkout = json!({"workspaceMode":input["workspaceMode"]});
    if let Err(error) = app::launch_checkout(&checkout, project, summary.id, &mut settings)
        .and_then(|()| locked(store)?.configure_agent(summary.id, kind.id(), &settings))
    {
        rollback(
            store,
            &summary,
            &settings,
            input["workspaceMode"] == "worktree",
        )
        .map_err(|cleanup| format!("{error}; cleanup failed: {cleanup}"))?;
        return Err(error);
    }
    Ok((summary, settings))
}

pub(super) fn rollback(
    store: &Database,
    summary: &Session,
    settings: &Settings,
    owned_checkout: bool,
) -> Result<(), String> {
    if owned_checkout && let Some(path) = &settings.worktree_cwd {
        molfar_core::worktree_management::remove_unstarted(
            std::path::Path::new(&summary.cwd),
            std::path::Path::new(path),
        )?;
    }
    locked(store)?.delete(summary.id)
}
