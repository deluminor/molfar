use super::{check, parse, schema::*, TargetKind, Tool};
use crate::external_mcp::grants::types::{ACCESS, DOMAIN};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct List {
    pub provider: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Read {
    pub item_key: String,
    pub max_chars: Option<usize>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Thread {
    pub item_key: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub max_chars: Option<usize>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Comment {
    pub item_key: String,
    pub body: String,
    pub reply_to: Option<String>,
    pub request_id: String,
}

pub(super) fn definitions() -> Vec<Tool> {
    let key = || string("Item key from inbox_list");
    let max_chars = || integer("1–6000 characters");
    let char_offset = || integer("nextCharOffset from a previous page");
    let limit = || integer("1–100, default 30");
    let offset = || integer("nextOffset from a previous page");
    let read = || {
        object(
            json!({"itemKey":key(),"maxChars":max_chars(),"charOffset":char_offset()}),
            &["itemKey"],
        )
    };
    [
        ("inbox_list", "List items from allowed, connected inbox providers.", false, ACCESS::Standard,
            object(json!({
                "provider":{"enum":crate::inbox::PROVIDERS}, "limit":limit(), "offset":offset()
            }), &[])),
        ("inbox_details", "Read a page of an inbox item's description.", false, ACCESS::Standard, read()),
        ("inbox_thread", "Read comments and commits for an inbox item.", false, ACCESS::Standard,
            object(json!({"itemKey":key(),"limit":limit(),"offset":offset(),"maxChars":max_chars(),"charOffset":char_offset()}), &["itemKey"])),
        ("inbox_diff", "Read a page of a pull or merge request diff.", false, ACCESS::Standard, read()),
        ("inbox_comment", "Post a comment or a supported reply on an inbox item.", true, ACCESS::Delegated,
            object(json!({"itemKey":key(),"body":string("Comment text"),"replyTo":string("ID of a reply target on this item"),"requestId":request_id()}), &["itemKey","body","requestId"])),
    ]
    .into_iter()
    .map(|(name, description, mutation, access, schema)| {
        let mut tool = Tool::domain(name, description, DOMAIN::Inbox, TargetKind::InboxProvider, mutation, access, schema);
        tool.resumable = !mutation;
        tool
    })
    .collect()
}

pub(super) fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    match name {
        "inbox_list" => check::<List>(arguments),
        "inbox_details" | "inbox_diff" => check::<Read>(arguments),
        "inbox_thread" => check::<Thread>(arguments),
        "inbox_comment" => {
            let input: Comment = parse(arguments)?;
            if input.body.trim().is_empty() || input.body.len() > 65_536 {
                return Err("A nonempty comment of at most 65,536 bytes is required.".into());
            }
            Ok(())
        }
        _ => Err("Unknown inbox tool.".into()),
    }
}
