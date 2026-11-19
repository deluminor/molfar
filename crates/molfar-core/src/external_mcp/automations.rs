use super::tools::automations::Upsert;
use crate::automations::{Automation, AutomationUpsert};

pub fn apply(
    mut draft: AutomationUpsert,
    input: Upsert,
    now: i64,
) -> Result<AutomationUpsert, String> {
    draft.name = input.name;
    draft.prompt = input.prompt;
    if let Some(triggers) = input.triggers {
        draft.triggers = Some(
            triggers
                .into_iter()
                .enumerate()
                .map(|(index, trigger)| trigger.into_trigger(format!("{}-{index}", draft.id)))
                .collect(),
        );
    }
    if let Some(mode) = input.workspace_mode {
        if !draft.worktree_cwd.is_empty() && draft.workspace_mode != mode {
            return Err("An existing worktree cannot be changed through external MCP.".into());
        }
        draft.workspace_mode = mode;
    }
    if let Some(reuse) = input.reuse_session {
        draft.reuse_session = reuse;
    }
    if let Some(grace) = input.missed_run_grace_minutes {
        draft.missed_run_grace_minutes = grace;
    }
    if let Some(enabled) = input.enabled {
        draft.enabled = enabled;
    }
    draft.sync_triggers(now);
    Ok(draft)
}

pub fn in_projects(automation: &Automation, projects: &[String]) -> bool {
    let key = crate::files::path_key(&automation.cwd);
    projects
        .iter()
        .any(|project| crate::files::path_key(project) == key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external_mcp::{
        grants::types::{ACCESS, DOMAIN, GRANT},
        tools,
    };
    use serde_json::{json, Value};

    #[test]
    fn automation_updates_keep_existing_rights_and_cannot_change_projects() {
        let mut input =
            json!({"automationId":"rule","name":"Name","prompt":"New prompt","requestId":"update"});
        for field in [
            "project",
            "cwd",
            "worktreeCwd",
            "harness",
            "model",
            "modelSettings",
            "runtimeMode",
            "appAccess",
        ] {
            input[field] = Value::String("forbidden".into());
            assert!(
                tools::validate("automations_upsert", &input).is_err(),
                "{field}"
            );
            input.as_object_mut().unwrap().remove(field);
        }
        let tool = tools::validate("automations_upsert", &input).unwrap();
        assert_eq!(tool.requires.any, [GRANT::Write(DOMAIN::Automations)]);
        assert_eq!(tool.requires.access, ACCESS::Delegated);
        let mut service =
            crate::automations::Service::open(std::path::Path::new(":memory:")).unwrap();
        let mut draft = AutomationUpsert::new("/project".into(), "codex".into(), "model".into());
        draft.name = "Before".into();
        draft.prompt = "Original prompt".into();
        draft.runtime_mode = "supervised".into();
        draft.workspace_mode = "existing".into();
        draft.worktree_cwd = "/saved-tree".into();
        draft.session_folder_id = "session-folder".into();
        draft.model_settings.insert("effort".into(), "high".into());
        let original = service.upsert(draft).unwrap();

        let edited = apply(
            AutomationUpsert::from_automation(&original),
            tools::parse(&input).unwrap(),
            crate::time::now_ms() as i64,
        )
        .unwrap();
        let edited = service.upsert(edited).unwrap();
        assert_eq!(edited.prompt, "New prompt");
        assert_eq!(edited.cwd, original.cwd);
        assert_eq!(edited.worktree_cwd, original.worktree_cwd);
        assert_eq!(edited.runtime_mode, original.runtime_mode);
        assert_eq!(edited.harness, original.harness);
        assert_eq!(edited.model, original.model);
        assert_eq!(edited.model_settings, original.model_settings);
        assert_eq!(edited.session_folder_id, original.session_folder_id);
    }
}
