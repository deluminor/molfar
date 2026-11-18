use super::{
    contracts::{parse, ArchiveRequest, CreateRequest, ListRequest, ReadRequest},
    normalize_request_id, parse_update,
    read::read,
    receipt::reserved,
    UpdateRequest,
};
use crate::{
    store::Store,
    task_board::{
        constants::{BACKLOG, IDLE},
        stage::{lifecycle::types::StageAction, owner::types::TaskEdit},
        types::{Card, CardCreate},
    },
};
use serde_json::{json, Value};

const DEFAULT_LIST: u32 = 30;

pub const READ_ACTIONS: [&str; 2] = ["board.list", "board.read"];
pub const WRITE_ACTIONS: [&str; 4] = [
    "board.create",
    "board.update",
    "board.archive",
    "board.unarchive",
];

pub fn is_board(action: &str) -> bool {
    READ_ACTIONS.contains(&action) || WRITE_ACTIONS.contains(&action)
}

/// Validates arguments without touching storage, so adapters can reject a
/// malformed call before any receipt lookup.
pub fn validate(action: &str, input: &Value) -> Result<(), String> {
    match action {
        "board.list" => parse::<ListRequest>(action, input).map(drop),
        "board.read" => parse::<ReadRequest>(action, input).map(drop),
        "board.create" => parse::<CreateRequest>(action, input).map(drop),
        "board.update" => {
            let fallback = input.get("requestId").is_none().then_some("validation");
            parse_update(input.clone(), fallback).map(drop)
        }
        "board.archive" | "board.unarchive" => parse::<ArchiveRequest>(action, input).map(drop),
        _ => Err("Unknown Board action. Run app help.".into()),
    }
}

/// `principal` namespaces request IDs per caller; `projects` must be the caller's
/// current assignments, never claims from the input.
pub fn action(
    store: &mut Store,
    principal: &str,
    envelope: &str,
    action: &str,
    input: &Value,
    projects: &[String],
) -> Result<Value, String> {
    match action {
        "board.list" => list(store, parse(action, input)?, projects),
        "board.read" => read(store, parse(action, input)?, projects),
        "board.create" => create(store, principal, envelope, parse(action, input)?, projects),
        "board.update" => {
            let request = parse_update(input.clone(), Some(envelope))?;
            let card = store.board_scoped_card(&request.card_id, projects)?;
            let project = card.project_cwd.clone();
            reserved(
                store,
                principal,
                &project,
                action,
                envelope,
                input,
                |store| update(store, card, request),
            )
        }
        "board.archive" | "board.unarchive" => {
            let request: ArchiveRequest = parse(action, input)?;
            normalize_request_id(request.request_id.as_deref(), Some(envelope))?;
            let card = store.board_scoped_card(&request.card_id, projects)?;
            reserved(
                store,
                principal,
                &card.project_cwd,
                action,
                envelope,
                input,
                |store| {
                    let card = store.board_set_archived(
                        &card.id,
                        card.updated_at,
                        action == "board.archive",
                    )?;
                    Ok(json!({"card": card_json(&card)}))
                },
            )
        }
        _ => Err("Unknown Board action. Run app help.".into()),
    }
}

fn list(store: &Store, request: ListRequest, projects: &[String]) -> Result<Value, String> {
    let limit = request.limit.unwrap_or(DEFAULT_LIST);
    let cards = store.board_scoped_list(
        request.project.as_deref(),
        projects,
        request.archived,
        request.offset,
        limit,
    )?;
    let next = request.offset.saturating_add(limit);
    let more = !store
        .board_scoped_list(
            request.project.as_deref(),
            projects,
            request.archived,
            next,
            1,
        )?
        .is_empty();

    Ok(json!({
        "cards": cards.iter().map(card_json).collect::<Vec<_>>(),
        "nextOffset": more.then_some(next),
    }))
}

/// The card ID derives from caller, project and request ID, so a retry after a lost
/// receipt finds the saved card instead of creating a second one.
fn create(
    store: &mut Store,
    principal: &str,
    envelope: &str,
    request: CreateRequest,
    projects: &[String],
) -> Result<Value, String> {
    let request_id = normalize_request_id(request.request_id.as_deref(), Some(envelope))?;
    let project = projects
        .iter()
        .find(|allowed| crate::files::path_key(allowed) == crate::files::path_key(&request.project))
        .ok_or("Board project not found.")?;
    let hash = crate::familiar::files::content_hash(&format!(
        "{principal}\n{}\n{request_id}",
        crate::files::path_key(project)
    ));
    let input = CardCreate {
        id: format!("app-{}", &hash[..32]),
        project_cwd: project.clone(),
        title: request.title,
        description: request.description,
        acceptance_criteria: request.acceptance_criteria,
        base_ref: request.base_ref,
    };
    let wanted = crate::task_board::create::validation::fields(&input)?;
    let card = store.board_create(&input, std::slice::from_ref(project))?;
    let same = (
        card.title.as_str(),
        card.description.as_str(),
        card.acceptance_criteria.as_str(),
        card.base_ref.as_deref(),
    ) == (
        wanted.title.as_str(),
        wanted.description.as_str(),
        wanted.acceptance_criteria.as_str(),
        wanted.base_ref.as_deref(),
    );
    if !same || crate::files::path_key(&card.project_cwd) != crate::files::path_key(project) {
        return Err("Request ID was already used with different input".into());
    }

    Ok(json!({"card": card_json(&card)}))
}

pub(super) fn idle_unqueued(card: &Card) -> bool {
    card.run_state == IDLE && card.queued_at.is_none()
}

pub(super) fn editable(card: &Card) -> bool {
    idle_unqueued(card) && card.column_id == BACKLOG && !card.archived
}

fn update(store: &mut Store, card: Card, request: UpdateRequest) -> Result<Value, String> {
    if !editable(&card) {
        return Err("conflict: only an idle Backlog card can be updated".into());
    }
    let edit = TaskEdit {
        title: request.title.unwrap_or_else(|| card.title.clone()),
        description: request
            .description
            .unwrap_or_else(|| card.description.clone()),
        acceptance_criteria: request
            .acceptance_criteria
            .unwrap_or_else(|| card.acceptance_criteria.clone()),
        base_ref: None,
    };
    let unchanged = (
        edit.title.as_str(),
        edit.description.as_str(),
        edit.acceptance_criteria.as_str(),
    ) == (
        card.title.as_str(),
        card.description.as_str(),
        card.acceptance_criteria.as_str(),
    );
    if unchanged {
        return Ok(json!({"card": card_json(&card)}));
    }

    let effect =
        store.board_stage_action(&card.id, card.updated_at, StageAction::EditTask(edit))?;
    Ok(json!({"card": card_json(&effect.card)}))
}

pub(super) fn card_json(card: &Card) -> Value {
    json!({
        "id": card.id,
        "number": card.number,
        "project": card.project_cwd,
        "title": card.title,
        "description": card.description,
        "acceptanceCriteria": card.acceptance_criteria,
        "column": card.column_id,
        "runState": card.run_state,
        "queued": card.queued_at.is_some(),
        "archived": card.archived,
        "baseRef": card.base_ref,
        "branch": card.branch,
        "lastError": card.last_error,
        "updatedAt": card.updated_at,
    })
}
