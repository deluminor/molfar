use super::{
    actions::{card_json, editable, idle_unqueued},
    contracts::ReadRequest,
    stage::EXTERNAL_ACTIONS,
};
use crate::{
    store::Store,
    task_board::stage::transitions::allowed::{action_allowed, allowed_moves},
};
use serde_json::{json, Value};

pub fn external_read(
    store: &Store,
    arguments: &Value,
    projects: &[String],
) -> Result<Value, String> {
    read(
        store,
        super::contracts::parse("board_read", arguments)?,
        projects,
        true,
    )
}

pub(super) fn read(
    store: &Store,
    request: ReadRequest,
    projects: &[String],
    external: bool,
) -> Result<Value, String> {
    let card = store.board_scoped_card(&request.card_id, projects)?;
    let snapshot = store.board_snapshot(Some(&card.project_cwd), card.archived, Some(&card.id))?;
    let mut allowed_actions: Vec<_> = if external {
        EXTERNAL_ACTIONS
            .into_iter()
            .filter(|&action| action_allowed(&card, &snapshot, action).is_ok())
            .map(|action| action.id())
            .collect()
    } else {
        allowed_moves(&card, Some(&snapshot))
            .into_iter()
            .map(|target| target.action.id())
            .collect()
    };
    if idle_unqueued(&card) {
        allowed_actions.push(if card.archived {
            "unarchive"
        } else {
            "archive"
        });
        if editable(&card) {
            allowed_actions.push("editTask");
        }
    }
    let runs = if snapshot.selected.as_deref() == Some(card.id.as_str()) {
        snapshot.runs
    } else {
        Vec::new()
    };
    let artifacts = store.board_stage_artifacts(&card.id)?;
    let questions = store.board_scoped_questions(&card.id, projects)?;
    let artifact = request
        .artifact_kind
        .as_deref()
        .map(|kind| {
            let request = super::artifacts::Read {
                card_id: card.id.clone(),
                kind: kind.to_owned(),
                version: request.artifact_version,
                max_chars: request.max_chars,
                char_offset: request.char_offset,
            };
            request.page(store, projects, &artifacts)
        })
        .transpose()?;

    Ok(json!({
        "card": card_json(&card),
        "allowedActions": allowed_actions,
        "runs": runs.iter().map(|run| json!({"id":run.id,"stage":run.stage,"attempt":run.attempt,"status":run.status,"error":run.error,"sessionId":run.session_id,"startedAt":run.started_at,"completedAt":run.completed_at})).collect::<Vec<_>>(),
        "artifacts": artifacts.iter().map(|meta| json!({"kind":meta.kind,"version":meta.version,"source":meta.source,"createdAt":meta.created_at})).collect::<Vec<_>>(),
        "questions": questions.iter().map(|q| json!({"number":q.number,"title":q.title,"body":q.body,"recommended":q.recommended})).collect::<Vec<_>>(),
        "artifact": artifact,
    }))
}
