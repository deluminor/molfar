use super::*;
use molfar_core::{
    accounts::Profile,
    agent::Settings,
    task_board::{
        stage::{
            checkout,
            choice::{self, types::StageSelection},
            contracts,
            lifecycle::types::{FailureStatus, StageEffect},
        },
        types::Card,
    },
};

pub(super) struct Defaults {
    #[cfg(test)]
    pub fixture: Option<super::tests::fixtures::Provider>,
    pub card: Card,
    pub selection: StageSelection,
    pub model: Option<String>,
    pub account: Profile,
    pub disabled_skills: Vec<String>,
}

pub(super) struct Launch {
    #[cfg(test)]
    pub registration: Option<crate::runtime::test_provider::Registration>,
    pub run_id: String,
    pub summary: Session,
    pub settings: Settings,
    pub warnings: Vec<String>,
}

pub(super) enum Prepared {
    Launch(Box<Launch>),
    Stopped,
    Failed(Box<StageEffect>),
}

pub(super) fn prepare(
    store: &Database,
    run_id: &str,
    defaults: Defaults,
) -> Result<Prepared, String> {
    let card = defaults.card.clone();
    match prepare_inner(store, run_id, defaults) {
        Ok(Some(launch)) => Ok(Prepared::Launch(Box::new(launch))),
        Ok(None) => Ok(Prepared::Stopped),
        Err(error) => {
            let mut store = locked(store)?;
            let effect = if store.board_grill_context(run_id)?.is_some() {
                store.board_fail_grill(run_id, FailureStatus::Failed, &error)?
            } else {
                store.board_fail_claimed_grill(&card.id, card.updated_at, &error)?
            };
            Ok(Prepared::Failed(Box::new(effect)))
        }
    }
}

fn prepare_inner(
    store: &Database,
    run_id: &str,
    defaults: Defaults,
) -> Result<Option<Launch>, String> {
    let kind = defaults.selection.kind;
    let source = locked(store)?
        .desktop_preferences()
        .and_then(|p| p.session_defaults(kind.id(), &defaults.card.project_cwd));
    let mut settings = super::super::session_loading::new_session_settings(source, defaults.model);
    settings.account = defaults.account;
    #[cfg(test)]
    let models = match &defaults.fixture {
        Some(fixture) => fixture.models.clone(),
        None => molfar_core::catalog::models_for(kind, &settings.account)?,
    };
    #[cfg(not(test))]
    let models = molfar_core::catalog::models_for(kind, &settings.account)?;
    let discovered = molfar_core::skills::list_skills(
        defaults.card.project_cwd.clone(),
        Some(defaults.disabled_skills),
    );
    let (skills, warning) = match discovered {
        Ok(skills) => (skills.into_iter().map(|skill| skill.name).collect(), None),
        Err(error) => (
            HashSet::new(),
            Some(format!("Skill catalog unavailable: {error}")),
        ),
    };
    #[cfg(test)]
    let available = defaults.fixture.is_some() || molfar_core::provider::resolve(kind).is_some();
    #[cfg(not(test))]
    let available = molfar_core::provider::resolve(kind).is_some();
    let mut resolved = choice::resolve(&defaults.selection, settings, &models, &skills, available)?;
    if let Some(warning) = warning {
        resolved.warnings.push(warning);
    }
    let context = locked(store)?.board_accept_grill(
        &defaults.card.id,
        defaults.card.updated_at,
        run_id,
        &resolved,
    )?;
    let retained = checkout::ensure_worktree(&context.card)?;
    let Some(context) = locked(store)?.board_record_grill_worktree(run_id, &retained)? else {
        return Ok(None);
    };
    let inputs = locked(store)?.board_grill_inputs(&context.card.id)?;
    let manifest = checkout::materialize(std::path::Path::new(&retained.path), &inputs)?;
    let before = checkout::snapshot(std::path::Path::new(&retained.path))?;
    let mut prompt_card = context.card.clone();
    if inputs.len() == 1 {
        prompt_card.grill_round = 1;
    }
    let prompt = contracts::build_grill_prompt(&prompt_card, &manifest, &resolved.skills)?;
    let mut settings = resolved.settings;
    settings.worktree_cwd = Some(retained.path);
    settings.new_worktree = false;
    let reserved = locked(store)?.board_reserve_grill_session(run_id, &settings, &prompt)?;
    let persisted = locked(store)?.persisted_session_id(reserved.session.id)?;
    if locked(store)?
        .board_record_grill_prepared(run_id, &before, &persisted)?
        .is_none()
    {
        return Ok(None);
    }
    if !locked(store)?.board_grill_is_current(run_id)? {
        return Ok(None);
    }
    #[cfg(test)]
    let registration = defaults.fixture.map(|fixture| {
        crate::runtime::test_provider::Registration::new(store, reserved.session.id, fixture.binary)
    });
    Ok(Some(Launch {
        #[cfg(test)]
        registration,
        run_id: run_id.to_owned(),
        summary: reserved.session,
        settings,
        warnings: resolved.warnings,
    }))
}
