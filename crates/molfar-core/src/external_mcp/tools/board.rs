use super::{schema::*, TargetKind, Tool};
use crate::external_mcp::grants::types::{Requirement, DOMAIN, GRANT};
use serde_json::json;

pub(super) fn definitions() -> Vec<Tool> {
    vec![
        Tool { name: "board_list", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Board)]), mutation: false, target: TargetKind::Project, resumable: true, description: "List Board cards in granted projects.", schema: object(json!({"project":string("Optional project path"),"archived":{"type":"boolean"},"limit":integer("1-100, default 30"),"offset":integer("nextOffset from a previous page")}), &[]) },
        Tool { name: "board_read", requires: Requirement::standard(&[GRANT::Read(DOMAIN::Board)]), mutation: false, target: TargetKind::Project, resumable: true, description: "Read a Board card: stage state, runs, artifact versions, questions and optionally one artifact page.", schema: object(json!({"cardId":string("Card ID"),"artifactKind":string("task, spec, plan, questions, answers, impl_report, ..."),"artifactVersion":integer("Defaults to the latest"),"maxChars":integer("1-6000"),"charOffset":integer("nextCharOffset from a previous page")}), &["cardId"]) },
        Tool { name: "board_create", requires: Requirement::standard(&[GRANT::BoardCreate]), mutation: true, target: TargetKind::Project, resumable: true, description: "Create one idle Backlog card. No stage or agent starts.", schema: object(json!({"project":string("Project path from projects_list"),"title":string("Title"),"description":string("Description"),"acceptanceCriteria":string("Optional criteria"),"baseRef":string("Optional base branch"),"requestId":request_id()}), &["project","title","description","requestId"]) },
        Tool { name: "board_update", requires: Requirement::standard(&[GRANT::Write(DOMAIN::Board)]), mutation: true, target: TargetKind::Project, resumable: true, description: "Edit title, description or acceptance criteria on an idle Backlog card.", schema: object(json!({"cardId":string("Card ID"),"title":string("Title"),"description":string("Description"),"acceptanceCriteria":string("Acceptance criteria"),"requestId":request_id()}), &["cardId","requestId"]) },
        board_archive_tool("board_archive", "Archive an idle, unqueued Board card."),
        board_archive_tool("board_unarchive", "Restore an idle, unqueued Board card."),
    ]
}

fn board_archive_tool(name: &'static str, description: &'static str) -> Tool {
    Tool {
        name,
        requires: Requirement::standard(&[GRANT::Write(DOMAIN::Board)]),
        mutation: true,
        target: TargetKind::Project,
        resumable: true,
        description,
        schema: object(
            json!({"cardId":string("Card ID"),"requestId":request_id()}),
            &["cardId", "requestId"],
        ),
    }
}
