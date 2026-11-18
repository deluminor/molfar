use super::{
    actions::{card_json, editable, idle_unqueued},
    contracts::ReadRequest,
};
use crate::{
    store::Store,
    task_board::{stage::transitions::allowed::allowed_moves, types::ArtifactRead},
};
use serde_json::{json, Value};

const DEFAULT_TEXT_PAGE: usize = 6_000;

pub(super) fn read(
    store: &Store,
    request: ReadRequest,
    projects: &[String],
) -> Result<Value, String> {
    let card = store.board_scoped_card(&request.card_id, projects)?;
    let snapshot = store.board_snapshot(Some(&card.project_cwd), card.archived, Some(&card.id))?;
    let mut allowed_actions: Vec<_> = allowed_moves(&card, Some(&snapshot))
        .iter()
        .map(|target| target.action.id())
        .collect();
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
            let version = request
                .artifact_version
                .or_else(|| {
                    artifacts
                        .iter()
                        .filter(|meta| meta.kind == kind)
                        .map(|meta| meta.version)
                        .max()
                })
                .ok_or("Board artifact not found.")?;
            let page = store.board_scoped_artifact(
                &card.id,
                projects,
                &ArtifactRead {
                    kind,
                    version,
                    max_chars: request.max_chars.unwrap_or(DEFAULT_TEXT_PAGE),
                    char_offset: request.char_offset,
                },
            )?;
            Ok::<_, String>(json!({"kind":kind,"version":version,"body":page.body,"nextCharOffset":page.next_char_offset}))
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
