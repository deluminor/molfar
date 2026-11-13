use super::*;
use molfar_core::{
    accounts::Profile,
    agent::Settings,
    task_board::{
        stage::{
            agent::AgentStage,
            checkout,
            choice::{self, types::StageSelection},
            contracts::{self, types::PromptExtras},
            lifecycle::types::{FailureStatus, SessionPlan, StageEffect},
            verify,
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
    /// The run continues its section's earlier session.
    pub reused: bool,
    /// The reused session must compact before the run's prompt is sent.
    pub compact: bool,
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
        Ok(prepared) => Ok(prepared),
        Err(error) => {
            let mut store = locked(store)?;
            let effect = if store.board_stage_context(run_id)?.is_some() {
                store.board_fail_stage(run_id, FailureStatus::Failed, &error)?
            } else {
                store.board_fail_claimed_stage(&card.id, card.updated_at, &error)?
            };
            Ok(Prepared::Failed(Box::new(effect)))
        }
    }
}

enum Checks {
    Skipped,
    Ran(String),
    Redirected(Box<StageEffect>),
}

/// Runs the project's verify command before a code review. Red checks send the card back
/// to Rework while the automatic budget lasts; otherwise the review prompt states the result.
fn verify(store: &Database, run_id: &str, card: &Card, checkout: &str) -> Result<Checks, String> {
    let settings = locked(store)?.board_settings_json()?;
    let Some(command) = choice::settings::verify_command(settings.as_deref(), &card.project_cwd)
    else {
        return Ok(Checks::Skipped);
    };

    let run = verify::run(
        std::path::Path::new(checkout),
        &command,
        verify::constants::TIMEOUT,
    );
    let summary = verify::summary(&run);
    if !run.passed
        && let Some(effect) = locked(store)?.board_stage_checks_failed(run_id, &summary)?
    {
        return Ok(Checks::Redirected(Box::new(effect)));
    }
    Ok(Checks::Ran(summary))
}

fn prepare_inner(store: &Database, run_id: &str, defaults: Defaults) -> Result<Prepared, String> {
    let stage = defaults.selection.stage;
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
    let context = locked(store)?.board_accept_stage(
        &defaults.card.id,
        defaults.card.updated_at,
        run_id,
        &resolved,
    )?;
    let retained = checkout::ensure_worktree(&context.card)?;
    let Some(context) = locked(store)?.board_record_stage_worktree(run_id, &retained)? else {
        return Ok(Prepared::Stopped);
    };
    let checks = if stage == AgentStage::CodeReview {
        match verify(store, run_id, &context.card, &retained.path)? {
            Checks::Skipped => None,
            Checks::Ran(summary) => Some(summary),
            Checks::Redirected(effect) => return Ok(Prepared::Failed(effect)),
        }
    } else {
        None
    };
    let inputs = locked(store)?.board_stage_inputs(&context.card.id)?;
    let manifest = checkout::materialize(std::path::Path::new(&retained.path), &inputs)?;
    let before = checkout::snapshot(std::path::Path::new(&retained.path))?;
    let mut prompt_card = context.card.clone();
    checkout::policy::before(stage, &before)?;
    if stage == AgentStage::Grill && inputs.len() == 1 {
        prompt_card.grill_round = 1;
    }
    let reviewed_head = if stage == AgentStage::CodeReview {
        locked(store)?
            .board_reviewed_head(&context.card.id)?
            .filter(|reviewed| *reviewed != before.head)
    } else {
        None
    };
    let plan = locked(store)?.board_stage_session_plan(run_id)?;
    let (reuse, compact) = match &plan {
        SessionPlan::Fresh => (None, false),
        SessionPlan::Reuse { session, compact } => (Some(session.as_str()), *compact),
    };
    let extras = PromptExtras {
        continuation: locked(store)?.board_stage_continuation(run_id)?,
        checks,
        reviewed_head,
        resumed: reuse.is_some(),
    };
    let prompt = contracts::build_stage_prompt(
        stage,
        &prompt_card,
        &manifest,
        &resolved.skills,
        &before.head,
        &extras,
    )?;
    let mut settings = resolved.settings;
    settings.worktree_cwd = Some(retained.path);
    settings.new_worktree = false;
    let reserved = locked(store)?.board_reserve_stage_session(run_id, &settings, &prompt, reuse)?;
    let persisted = locked(store)?.persisted_session_id(reserved.session.id)?;
    if locked(store)?
        .board_record_stage_prepared(run_id, &before, &persisted)?
        .is_none()
    {
        return Ok(Prepared::Stopped);
    }
    if !locked(store)?.board_stage_is_current(run_id)? {
        return Ok(Prepared::Stopped);
    }
    #[cfg(test)]
    // A reused session keeps the fake provider its first run registered.
    let registration = defaults.fixture.filter(|_| reuse.is_none()).map(|fixture| {
        crate::runtime::test_provider::Registration::new(store, reserved.session.id, fixture.binary)
    });
    Ok(Prepared::Launch(Box::new(Launch {
        #[cfg(test)]
        registration,
        run_id: run_id.to_owned(),
        summary: reserved.session,
        settings,
        warnings: resolved.warnings,
        reused: reuse.is_some(),
        compact,
    })))
}
