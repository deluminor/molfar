use super::{
    skills,
    types::{GrillSelection, ResolvedGrillChoice},
};
use crate::{agent::Settings, app_access, catalog::Model};
use serde_json::json;
use std::collections::{HashMap, HashSet};

pub(super) fn resolve(
    selection: &GrillSelection,
    defaults: Settings,
    models: &[Model],
    available_skills: &HashSet<String>,
    provider_available: bool,
) -> Result<ResolvedGrillChoice, String> {
    if !provider_available {
        return Err(format!(
            "{} is not available in MOLFAR",
            selection.kind.label()
        ));
    }
    let requested = selection.input["model"]
        .as_str()
        .map(|id| {
            crate::store::native_model(id, selection.kind.id())
                .ok_or_else(|| "Unknown model for this provider.".to_owned())
        })
        .transpose()?;
    let model = if let Some(id) = requested {
        models
            .iter()
            .find(|model| model.id == id)
            .ok_or("Unknown model for this provider.")?
    } else {
        let default = (selection.kind == selection.default_kind)
            .then_some(defaults.model.as_deref())
            .flatten();
        models
            .iter()
            .find(|model| Some(model.id.as_str()) == default)
            .or_else(|| models.iter().find(|model| model.default))
            .or_else(|| models.first())
            .ok_or("No model is available for this provider.")?
    };
    let controls: HashMap<_, _> = app_access::model_controls(selection.kind, model)
        .into_iter()
        .filter(|control| {
            control
                .choices
                .iter()
                .any(|(value, _)| *value == control.current)
        })
        .map(|control| (control.id, control.current))
        .collect();
    let mut input = selection.input.clone();
    input["model"] = json!(model.id);
    input["modelSettings"] = json!(controls);
    let defaults = Settings {
        account: defaults.account,
        model: defaults.model,
        ..Default::default()
    };
    let settings = app_access::launch_settings(
        &input,
        selection.default_kind.id(),
        defaults,
        selection.kind,
        models,
    )?;
    let (skills, missing) =
        skills::resolve(selection.configured_skills.as_deref(), available_skills);
    let warnings = missing
        .into_iter()
        .map(|name| format!("Configured skill is missing from the catalog: {name}"))
        .collect();
    Ok(ResolvedGrillChoice {
        kind: selection.kind,
        model: model.id.clone(),
        runtime_mode: settings.access.id().into(),
        model_settings: json!(settings.model_settings),
        settings,
        skills,
        warnings,
    })
}
