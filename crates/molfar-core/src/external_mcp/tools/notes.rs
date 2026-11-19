use super::{
    schema::{integer, object, request_id, string},
    Tool,
};
use crate::{
    app_access::notes::external::*,
    external_mcp::grants::types::{Requirement, ACCESS, DOMAIN, GRANT},
};
use serde_json::json;

pub(super) fn definitions() -> Vec<Tool> {
    let note_id = string("Note ID");
    let fields = json!({
        "title":string("Optional title"),
        "body":string("Markdown body"),
        "tags":{"type":"array","items":{"type":"string"}},
        "requestId":request_id(),
    });
    let mut create = fields.clone();
    create["project"] = string("Project path from projects_list");
    let mut write = fields;
    write["id"] = note_id.clone();

    vec![
        Tool {
            name: LIST,
            requires: Requirement::standard(&[GRANT::Read(DOMAIN::Notes)]),
            mutation: false,
            description: "List notes linked to granted projects.",
            schema: object(
                json!({"project":string("Optional project path"),"limit":integer("1–100, default 30"),"offset":integer("Entries to skip")}),
                &[],
            ),
        },
        Tool {
            name: READ,
            requires: Requirement::standard(&[GRANT::Read(DOMAIN::Notes)]),
            mutation: false,
            description: "Read one page of an accessible note.",
            schema: object(
                json!({"id":note_id,"maxChars":{"type":"integer","minimum":1,"maximum":6000},"charOffset":integer("nextCharOffset from a previous page")}),
                &["id"],
            ),
        },
        Tool {
            name: CREATE,
            requires: Requirement::standard(&[GRANT::Write(DOMAIN::Notes)]),
            mutation: true,
            description: "Create a note in a granted project.",
            schema: object(create, &["project", "body", "requestId"]),
        },
        Tool {
            name: WRITE,
            requires: Requirement::standard(&[GRANT::Write(DOMAIN::Notes)]),
            mutation: true,
            description: "Change title, body or tags of an accessible note.",
            schema: object(write, &["id", "requestId"]),
        },
        Tool {
            name: DELETE,
            requires: Requirement {
                any: &[GRANT::Write(DOMAIN::Notes)],
                access: ACCESS::Destructive,
            },
            mutation: true,
            description: "Permanently delete an accessible note.",
            schema: object(
                json!({"id":note_id,"requestId":request_id()}),
                &["id", "requestId"],
            ),
        },
    ]
}
