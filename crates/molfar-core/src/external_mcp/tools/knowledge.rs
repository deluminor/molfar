use super::{check, schema::*, TargetKind, Tool};
use crate::external_mcp::grants::types::{ACCESS, DOMAIN};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Search {
    pub query: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Links {
    pub path: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Read {
    pub path: String,
    pub max_chars: Option<usize>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Write {
    pub path: String,
    pub body: String,
    pub expected: String,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Toggle {
    pub path: String,
    pub ordinal: usize,
    pub expected: String,
    pub request_id: String,
}

pub(super) fn definitions() -> Vec<Tool> {
    let path = || string("Vault-relative Markdown path");
    let limit = || integer("1–100, default 30");
    let offset = || integer("nextOffset from a previous page");
    let links = || {
        object(
            json!({"path":path(),"limit":limit(),"offset":offset()}),
            &["path"],
        )
    };
    [
        ("knowledge_search", "Search visible Markdown notes in the allowed vault.", false,
            object(json!({"query":string("Search text"),"limit":limit(),"offset":offset()}), &["query"])),
        ("knowledge_read", "Read a page of an existing Markdown note.", false,
            object(json!({"path":path(),"maxChars":integer("1–6000"),"charOffset":integer("nextCharOffset from a previous page")}), &["path"])),
        ("knowledge_backlinks", "List notes that link to a note.", false, links()),
        ("knowledge_neighbors", "List resolved outgoing links and backlinks.", false, links()),
        ("knowledge_write", "Replace an existing note at the supplied revision.", true,
            object(json!({"path":path(),"body":string("Markdown, at most 2 MiB"),"expected":string("Revision from knowledge_read"),"requestId":request_id()}), &["path","body","expected","requestId"])),
        ("knowledge_toggle_task", "Toggle a Markdown task at the supplied revision.", true,
            object(json!({"path":path(),"ordinal":integer("Zero-based task index"),"expected":string("Revision from knowledge_read"),"requestId":request_id()}), &["path","ordinal","expected","requestId"])),
    ]
    .into_iter()
    .map(|(name, description, mutation, schema)| {
        Tool::domain(name, description, DOMAIN::Knowledge, TargetKind::Vault, mutation, ACCESS::Standard, schema)
    })
    .collect()
}

pub(super) fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    match name {
        "knowledge_search" => check::<Search>(arguments),
        "knowledge_read" => check::<Read>(arguments),
        "knowledge_backlinks" | "knowledge_neighbors" => check::<Links>(arguments),
        "knowledge_write" => check::<Write>(arguments),
        "knowledge_toggle_task" => check::<Toggle>(arguments),
        _ => Err("Unknown knowledge tool.".into()),
    }
}
